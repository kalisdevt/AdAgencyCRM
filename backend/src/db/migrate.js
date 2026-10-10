import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config } from '../config.js'
import { createPool } from './pool.js'

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url))
// Произвольный ключ блокировки: не дает двум экземплярам применять миграции одновременно
const LOCK_KEY = 4820261

export async function migrate(pool) {
  const client = await pool.connect()
  const applied = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)
    const { rows } = await client.query('SELECT name FROM schema_migrations')
    const done = new Set(rows.map((row) => row.name))
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()

    for (const file of files) {
      if (done.has(file)) continue
      const sql = await readFile(path.join(migrationsDir, file), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Миграция ${file} не применена: ${error.message}`, { cause: error })
      }
      applied.push(file)
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    client.release()
  }
  return applied
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(config.databaseUrl)
  try {
    const applied = await migrate(pool)
    console.log(applied.length ? `Применены миграции: ${applied.join(', ')}` : 'Новых миграций нет')
  } finally {
    await pool.end()
  }
}
