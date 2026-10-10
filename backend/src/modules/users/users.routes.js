import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { idParam } from '../../validation.js'
import { listRoles, listUsers, toPublicUser } from './users.repository.js'
import { createUser, updateUser } from './users.service.js'

const ROLE_CODES = ['admin', 'manager', 'designer', 'marketer', 'sales_head', 'director', 'client']
// Сотрудники, которым можно назначить обращение
const ASSIGNABLE_ROLES = ['manager', 'sales_head']

const fullName = z.string({ error: 'Укажите имя' }).trim().min(2, 'Имя слишком короткое').max(120)
const email = z.email('Некорректный адрес почты').max(200)
const password = z
  .string({ error: 'Укажите пароль' })
  .min(8, 'Пароль должен быть не короче 8 символов')
  .max(72, 'Пароль должен быть не длиннее 72 символов')
const role = z.enum(ROLE_CODES, { error: 'Неизвестная роль' })
const clientId = z.number().int().positive()

const createSchema = z.object({
  login: z
    .string({ error: 'Укажите логин' })
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,40}$/, 'Логин: 3–40 символов, латинские буквы, цифры, точка, дефис, подчеркивание'),
  email: email.nullish(),
  fullName,
  password,
  role,
  clientId: clientId.nullish(),
})

const updateSchema = z
  .object({
    email: email.nullable(),
    fullName,
    password,
    role,
    clientId: clientId.nullable(),
    isActive: z.boolean(),
  })
  .partial()

export function usersRoutes({ pool }) {
  const router = Router()

  // Справочник для назначения ответственного доступен тем, кто работает с обращениями
  router.get('/assignable', requireRole('admin', 'manager', 'sales_head'), async (req, res) => {
    const users = await listUsers(pool, { roles: ASSIGNABLE_ROLES })
    res.json({
      items: users.filter((user) => user.is_active).map((user) => ({ id: user.id, fullName: user.full_name, role: user.role })),
    })
  })

  router.use(requireRole('admin'))

  router.get('/', async (req, res) => {
    res.json({ items: (await listUsers(pool)).map(toPublicUser) })
  })

  router.get('/roles', async (req, res) => {
    res.json({ items: await listRoles(pool) })
  })

  router.post('/', async (req, res) => {
    const user = await createUser(pool, createSchema.parse(req.body ?? {}))
    res.status(201).json({ user })
  })

  router.patch('/:id', async (req, res) => {
    const user = await updateUser(pool, idParam(req.params.id), updateSchema.parse(req.body ?? {}), req.user)
    res.json({ user })
  })

  return router
}
