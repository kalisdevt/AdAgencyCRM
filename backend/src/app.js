import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'

export function createApp({ pool }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '100kb' }))

  const api = express.Router()

  api.get('/health', async (req, res) => {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() })
  })

  app.use('/api', cors({ origin: config.corsOrigin }), api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
