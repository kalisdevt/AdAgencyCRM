const env = process.env

const isProduction = env.NODE_ENV === 'production'

if (isProduction && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET обязателен при NODE_ENV=production')
}

export const config = {
  isProduction,
  port: Number(env.PORT) || 3000,
  databaseUrl: env.DATABASE_URL || 'postgres://crm:crm@localhost:5432/crm',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret',
  jwtTtl: env.JWT_TTL || '12h',
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    polling: env.TELEGRAM_POLLING === 'true',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
  },
}
