import express, { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config.js'
import { requireRole } from '../../middleware/auth.js'
import { OVERSIGHT_ROLES, SALES_ROLES } from '../../roles.js'
import { idParam } from '../../validation.js'
import { parseFileName } from '../files/files.service.js'
import { listTasks } from './tasks.repository.js'
import { addComment, addTaskFile, createTask, loadTaskCard, TASK_STATUS_CODES, TASK_STATUSES, updateTask } from './tasks.service.js'

const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Срок — дата в формате ГГГГ-ММ-ДД')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Некорректная дата срока')
  .nullable()

const description = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(5000, 'Описание длиннее 5000 символов').nullable(),
)

const title = z.string({ error: 'Укажите название задачи' }).trim().min(2, 'Название слишком короткое').max(200, 'Название длиннее 200 символов')
const assigneeId = z.number({ error: 'Выберите исполнителя' }).int().positive()

const createSchema = z.object({
  dealId: z.number({ error: 'Не указана сделка' }).int().positive(),
  title,
  description: description.optional(),
  assigneeId,
  dueDate: dueDate.optional(),
})

const updateSchema = z
  .object({
    title,
    description,
    assigneeId,
    dueDate,
    status: z.enum(TASK_STATUS_CODES, { error: 'Неизвестный статус задачи' }),
  })
  .partial()

const listSchema = z.object({
  // mine — где я исполнитель или постановщик, all — все (для руководящих ролей)
  scope: z.enum(['mine', 'all']).optional(),
  status: z.enum(TASK_STATUS_CODES, { error: 'Неизвестный статус задачи' }).optional(),
  dealId: z.string().regex(/^\d{1,15}$/).optional(),
  open: z.enum(['1', 'true']).optional(),
})

const commentSchema = z.object({
  text: z.string({ error: 'Введите текст комментария' }).trim().min(1, 'Введите текст комментария').max(4000, 'Комментарий длиннее 4000 символов'),
})

export function tasksRoutes({ pool, storage }) {
  const router = Router()

  router.get('/statuses', (req, res) => {
    res.json({ items: TASK_STATUSES })
  })

  router.get('/', async (req, res) => {
    const query = listSchema.parse(req.query)
    const seesAll = OVERSIGHT_ROLES.includes(req.user.role)
    const filters = {
      status: query.status,
      open: Boolean(query.open),
      dealId: query.dealId ? Number(query.dealId) : undefined,
    }
    // Дизайнер и маркетолог видят только свои задачи
    if (!seesAll || query.scope !== 'all') filters.involvedUserId = req.user.id
    res.json({ items: await listTasks(pool, filters) })
  })

  router.post('/', requireRole(...SALES_ROLES), async (req, res) => {
    const task = await createTask(pool, createSchema.parse(req.body ?? {}), req.user)
    res.status(201).json({ task })
  })

  router.get('/:id', async (req, res) => {
    res.json(await loadTaskCard(pool, idParam(req.params.id), req.user))
  })

  router.patch('/:id', async (req, res) => {
    const task = await updateTask(pool, idParam(req.params.id), updateSchema.parse(req.body ?? {}), req.user)
    res.json({ task })
  })

  router.post('/:id/comments', async (req, res) => {
    const { text } = commentSchema.parse(req.body ?? {})
    const comment = await addComment(pool, idParam(req.params.id), text, req.user)
    res.status(201).json({ comment })
  })

  // Файл передается телом запроса как есть, имя — в заголовке X-File-Name
  router.post(
    '/:id/files',
    express.raw({ type: () => true, limit: `${config.maxUploadMb}mb` }),
    async (req, res) => {
      const id = idParam(req.params.id)
      const name = parseFileName(req.get('X-File-Name'))
      const file = await addTaskFile(pool, storage, id, { content: req.body, name }, req.user)
      res.status(201).json({ file })
    },
  )

  return router
}
