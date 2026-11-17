import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createPool } from '../src/db/pool.js'
import { migrate } from '../src/db/migrate.js'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { seedUsers } from '../src/db/seed.js'
import { createStorage } from '../src/storage.js'

export const TEST_PASSWORD = 'test-password-1'

// Тесты работают в отдельной базе на том же сервере, рабочие данные не затрагиваются
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  const url = new URL(config.databaseUrl)
  url.pathname = `${url.pathname}_test`
  return url.toString()
}

async function ensureDatabase(url) {
  const name = new URL(url).pathname.slice(1)
  const admin = createPool(config.databaseUrl)
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }
}

export async function startTestApp(options = {}) {
  const url = testDatabaseUrl()
  await ensureDatabase(url)
  const pool = createPool(url)
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  await migrate(pool)
  await seedUsers(pool, TEST_PASSWORD)

  // Файлы тестов пишутся во временный каталог (или в БД, если тест передал storageKind: 'db')
  const storageDir = await mkdtemp(path.join(tmpdir(), 'crm-test-'))
  const { storageKind = 'disk', ...appOptions } = options
  const storage = createStorage({ kind: storageKind, dir: storageDir, pool })
  const app = createApp({ pool, storage, ...appOptions })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`

  async function request(method, path, { body, token, headers } = {}) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  // Загрузка файла: тело — содержимое как есть, имя — в заголовке X-File-Name
  async function upload(path, { token, name, content, type = 'application/octet-stream' }) {
    const response = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), Authorization: `Bearer ${token}` },
      body: content,
    })
    return { status: response.status, body: await response.json() }
  }

  async function download(path, token) {
    const response = await fetch(baseUrl + path, { headers: { Authorization: `Bearer ${token}` } })
    return { status: response.status, headers: response.headers, content: Buffer.from(await response.arrayBuffer()) }
  }

  async function loginAs(login) {
    const { body } = await request('POST', '/auth/login', { body: { login, password: TEST_PASSWORD } })
    return body.token
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
    await rm(storageDir, { recursive: true, force: true })
  }

  async function userId(login) {
    const { rows } = await pool.query('SELECT id FROM users WHERE login = $1', [login])
    return rows[0].id
  }

  return { pool, storage, request, upload, download, loginAs, userId, stop }
}
