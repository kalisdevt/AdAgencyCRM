import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { authenticate, requireRole } from './middleware/auth.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { createChannels } from './modules/channels/index.js'
import { channelWebhookRoutes, publicRoutes } from './modules/channels/intake.routes.js'
import { clientsRoutes, inboxRoutes } from './modules/leads/leads.routes.js'
import { dealsRoutes } from './modules/deals/deals.routes.js'

// Роли, которые работают с обращениями, сделками и карточками клиентов
const SALES_ROLES = ['admin', 'manager', 'sales_head']

export function createApp({
  pool,
  channels = createChannels({ telegram: { token: config.telegram.token } }),
  telegramWebhookSecret = config.telegram.webhookSecret,
}) {
  const app = express()
  app.disable('x-powered-by')
  // За обратным прокси (nginx в Docker Compose, сеть Vercel) адрес клиента берется из X-Forwarded-For
  app.set('trust proxy', config.trustProxy)
  app.use(express.json({ limit: '100kb' }))

  const auth = authenticate(pool)
  const api = express.Router()

  api.get('/health', async (req, res) => {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() })
  })

  api.use('/auth', authRoutes({ pool, auth }))
  api.use('/users', auth, usersRoutes({ pool }))
  api.use('/inbox', auth, requireRole(...SALES_ROLES), inboxRoutes({ pool }))
  api.use('/deals', auth, requireRole(...SALES_ROLES), dealsRoutes({ pool, channels }))
  api.use('/clients', auth, requireRole(...SALES_ROLES), clientsRoutes({ pool }))

  // Точки входа внешних каналов: вызываются сайтом и Telegram, а не веб-интерфейсом
  app.use('/api/public', cors(), publicRoutes({ pool, channels }))
  app.use('/api/channels', channelWebhookRoutes({ pool, channels, telegramWebhookSecret }))
  app.use('/api', cors({ origin: config.corsOrigin }), api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
