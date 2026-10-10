const env = process.env

const isProduction = env.NODE_ENV === 'production'

if (isProduction && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET обязателен при NODE_ENV=production')
}

const databaseUrl = env.DATABASE_URL || 'postgres://crm:crm@localhost:5432/crm'

function parseTrustProxy(value) {
  if (!value) return 'loopback, uniquelocal'
  if (value === 'true') return true
  return /^\d+$/.test(value) ? Number(value) : value
}

export const config = {
  isProduction,
  port: Number(env.PORT) || 3000,
  databaseUrl,
  // Миграции берут блокировку на уровне сеанса, поэтому им нужно прямое соединение,
  // а не пул соединений провайдера (Neon задает его в DATABASE_URL_UNPOOLED)
  migrationDatabaseUrl: env.DATABASE_URL_UNPOOLED || databaseUrl,
  dbPoolMax: Number(env.DB_POOL_MAX) || 10,
  // Сколько прокси перед сервером доверять при определении адреса клиента (настройка Express «trust proxy»)
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret',
  jwtTtl: env.JWT_TTL || '12h',
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    polling: env.TELEGRAM_POLLING === 'true',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
  },
}
