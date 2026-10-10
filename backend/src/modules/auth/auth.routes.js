import { Router } from 'express'
import { z } from 'zod'
import { login } from './auth.service.js'

const loginSchema = z.object({
  login: z.string({ error: 'Укажите логин' }).trim().min(1, 'Укажите логин').max(200),
  password: z.string({ error: 'Укажите пароль' }).min(1, 'Укажите пароль').max(200),
})

export function authRoutes({ pool, auth }) {
  const router = Router()

  router.post('/login', async (req, res) => {
    const credentials = loginSchema.parse(req.body ?? {})
    res.json(await login(pool, credentials))
  })

  router.get('/me', auth, (req, res) => {
    res.json({ user: req.user })
  })

  return router
}
