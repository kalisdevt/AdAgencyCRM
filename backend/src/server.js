import { config } from './config.js'
import { createPool } from './db/pool.js'
import { migrate } from './db/migrate.js'
import { createApp } from './app.js'
import { createChannels } from './modules/channels/index.js'
import { createTelegramUpdateHandler } from './modules/channels/intake.routes.js'

const pool = createPool(config.databaseUrl, { max: config.dbPoolMax })

// Отдельное кратковременное соединение для миграций (см. migrationDatabaseUrl в config.js)
const migrationPool = createPool(config.migrationDatabaseUrl, { max: 1 })
let applied
try {
  applied = await migrate(migrationPool)
} finally {
  await migrationPool.end()
}
if (applied.length) console.log(`Применены миграции: ${applied.join(', ')}`)

if (process.env.SEED_DEMO === 'true') {
  const { seedUsers, seedInquiries } = await import('./db/seed.js')
  const users = await seedUsers(pool)
  const inquiries = await seedInquiries(pool)
  if (users || inquiries) console.log(`Демо-данные: пользователей ${users}, обращений ${inquiries}`)
}

const channels = createChannels({ telegram: { token: config.telegram.token } })
const app = createApp({ pool, channels })

let stopPolling = () => {}
if (config.telegram.token && config.telegram.polling) {
  stopPolling = channels.get('telegram').startPolling(createTelegramUpdateHandler({ pool, channels }))
  console.log('Telegram: прием сообщений длинным опросом включен')
} else if (!config.telegram.token) {
  console.log('Telegram: токен не задан, канал отключен (работает прием заявок с веб-формы)')
}

const server = app.listen(config.port, () => {
  console.log(`API CRM-Агентство запущено: http://localhost:${config.port}/api`)
})

async function shutdown() {
  stopPolling()
  server.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
