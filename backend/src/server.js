import { config } from './config.js'
import { createPool } from './db/pool.js'
import { migrate } from './db/migrate.js'
import { createApp } from './app.js'

const pool = createPool(config.databaseUrl)

const applied = await migrate(pool)
if (applied.length) console.log(`Применены миграции: ${applied.join(', ')}`)

const app = createApp({ pool })
const server = app.listen(config.port, () => {
  console.log(`API CRM-Агентство запущено: http://localhost:${config.port}/api`)
})

async function shutdown() {
  server.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
