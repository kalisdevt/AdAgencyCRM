import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../../errors.js'
import { idParam } from '../../validation.js'
import { countUnreadDeals, listContacts, listDealsByClient, listInbox, listMessages } from '../deals/deals.repository.js'
import { STAGE_CODES } from '../deals/stages.js'
import { listProjects } from '../projects/projects.repository.js'
import { createUser, updateUser } from '../users/users.service.js'
import { normalizePhone } from './contacts.js'

const inboxQuerySchema = z.object({
  channel: z.enum(['telegram', 'web', 'vk'], { error: 'Неизвестный канал' }).optional(),
  stage: z.enum(STAGE_CODES, { error: 'Неизвестная стадия' }).optional(),
  // me — мои, none — без ответственного, число — конкретный сотрудник
  assignee: z.union([z.literal('me'), z.literal('none'), z.string().regex(/^\d{1,15}$/)], { error: 'Некорректный ответственный' }).optional(),
  unread: z.enum(['1', 'true']).optional(),
})

const nullableText = (max) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), z.string().trim().max(max).nullable())

const clientSchema = z
  .object({
    name: z.string().trim().min(2, 'Укажите имя клиента').max(120),
    phone: nullableText(30),
    email: z.preprocess((value) => (value === '' ? null : value), z.email('Некорректный адрес почты').max(200).nullable()),
    company: nullableText(200),
    inn: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().regex(/^(\d{10}|\d{12})$/, 'ИНН — 10 или 12 цифр').nullable(),
    ),
    address: nullableText(300),
    note: nullableText(2000),
  })
  .partial()

const accountCreateSchema = z.object({
  login: z
    .string({ error: 'Укажите логин' })
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,40}$/, 'Логин: 3–40 символов, латинские буквы, цифры, точка, дефис, подчеркивание'),
  password: z.string({ error: 'Укажите пароль' }).min(8, 'Пароль должен быть не короче 8 символов').max(72, 'Пароль должен быть не длиннее 72 символов'),
})

const accountUpdateSchema = z
  .object({
    isActive: z.boolean(),
    password: accountCreateSchema.shape.password,
  })
  .partial()

function toClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    inn: row.inn,
    address: row.address,
    note: row.note,
    createdAt: row.created_at,
  }
}

export function inboxRoutes({ pool }) {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = inboxQuerySchema.parse(req.query)
    const filters = { channel: query.channel, stage: query.stage, unreadOnly: Boolean(query.unread) }
    if (query.assignee === 'me') filters.assigneeId = req.user.id
    else if (query.assignee === 'none') filters.unassigned = true
    else if (query.assignee) filters.assigneeId = Number(query.assignee)

    const [items, unreadTotal] = await Promise.all([listInbox(pool, filters), countUnreadDeals(pool)])
    res.json({ items, unreadTotal })
  })

  return router
}

// Карточка клиента (FR-LEAD-05): контакты, история сообщений, сделки и проекты
export function clientsRoutes({ pool }) {
  const router = Router()

  async function loadCard(id) {
    const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id])
    if (!rows[0]) throw notFound('Клиент не найден')
    const [contacts, deals, messages, projects, portalAccounts] = await Promise.all([
      listContacts(pool, id),
      listDealsByClient(pool, id),
      listMessages(pool, { clientId: id }),
      listProjects(pool, { clientId: id }),
      pool.query(
        `SELECT u.id, u.login, u.is_active FROM users u JOIN roles r ON r.id = u.role_id WHERE u.client_id = $1 AND r.code = 'client'`,
        [id],
      ),
    ])
    return {
      client: toClient(rows[0]),
      contacts,
      deals,
      messages,
      projects,
      portalAccounts: portalAccounts.rows.map((row) => ({ id: row.id, login: row.login, isActive: row.is_active })),
    }
  }

  router.get('/:id', async (req, res) => {
    res.json(await loadCard(idParam(req.params.id)))
  })

  // Учетная запись клиента для личного кабинета создается менеджером (FR-PORT-01)
  router.post('/:id/account', async (req, res) => {
    const id = idParam(req.params.id)
    const { rows } = await pool.query('SELECT name, email FROM clients WHERE id = $1', [id])
    if (!rows[0]) throw notFound('Клиент не найден')
    const data = accountCreateSchema.parse(req.body ?? {})
    await createUser(pool, { ...data, fullName: rows[0].name, role: 'client', clientId: id })
    res.status(201).json(await loadCard(id))
  })

  // Блокировка и смена пароля — только для учетной записи этого клиента
  router.patch('/:id/account/:userId', async (req, res) => {
    const id = idParam(req.params.id)
    const userId = idParam(req.params.userId)
    const { rowCount } = await pool.query(
      `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.client_id = $2 AND r.code = 'client'`,
      [userId, id],
    )
    if (!rowCount) throw notFound('Учетная запись клиента не найдена')
    await updateUser(pool, userId, accountUpdateSchema.parse(req.body ?? {}), req.user)
    res.json(await loadCard(id))
  })

  router.patch('/:id', async (req, res) => {
    const id = idParam(req.params.id)
    const data = clientSchema.parse(req.body ?? {})
    if (data.phone) {
      data.phone = normalizePhone(data.phone)
      if (!data.phone) {
        return res.status(400).json({ error: { code: 'validation_error', message: 'Некорректный номер телефона' } })
      }
    }
    const columns = { name: 'name', phone: 'phone', email: 'email', company: 'company', inn: 'inn', address: 'address', note: 'note' }
    const fields = Object.keys(columns).filter((key) => data[key] !== undefined)
    if (fields.length) {
      const sets = fields.map((key, index) => `${columns[key]} = $${index + 2}`).join(', ')
      const { rowCount } = await pool.query(`UPDATE clients SET ${sets} WHERE id = $1`, [id, ...fields.map((key) => data[key])])
      if (!rowCount) throw notFound('Клиент не найден')
    }
    res.json(await loadCard(id))
  })

  return router
}
