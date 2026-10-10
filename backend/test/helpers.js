import { createPool } from '../src/db/pool.js'
import { migrate } from '../src/db/migrate.js'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { seedUsers } from '../src/db/seed.js'

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

  const app = createApp({ pool, ...options })
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

  async function loginAs(login) {
    const { body } = await request('POST', '/auth/login', { body: { login, password: TEST_PASSWORD } })
    return body.token
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  }

  return { pool, request, loginAs, stop }
}
