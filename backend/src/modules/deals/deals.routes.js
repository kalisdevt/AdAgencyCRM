import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../../errors.js'
import { idParam } from '../../validation.js'
import { findDeal, listContacts, listMessages } from './deals.repository.js'
import { markDealRead, replyBlocker, replyToClient, updateDeal } from './deals.service.js'
import { STAGE_CODES, STAGES } from './stages.js'

const updateSchema = z
  .object({
    stage: z.enum(STAGE_CODES, { error: 'Неизвестная стадия сделки' }),
    refusalReasonId: z.number({ error: 'Выберите причину отказа' }).int().positive(),
    refusalComment: z.string().max(1000, 'Комментарий слишком длинный').nullable(),
    assigneeId: z.number().int().positive().nullable(),
    amount: z
      .number({ error: 'Сумма должна быть числом' })
      .min(0, 'Сумма не может быть отрицательной')
      .max(9_999_999_999, 'Слишком большая сумма'),
  })
  .partial()

const replySchema = z.object({
  text: z
    .string({ error: 'Введите текст сообщения' })
    .trim()
    .min(1, 'Введите текст сообщения')
    .max(4000, 'Сообщение длиннее 4000 символов'),
})

export function dealsRoutes({ pool, channels }) {
  const router = Router()

  router.get('/stages', (req, res) => {
    res.json({ items: STAGES })
  })

  router.get('/refusal-reasons', async (req, res) => {
    const { rows } = await pool.query('SELECT id, name FROM refusal_reasons WHERE is_active ORDER BY id')
    res.json({ items: rows })
  })

  // Сделка с перепиской — для панели диалога в ленте «Входящие»
  router.get('/:id', async (req, res) => {
    const deal = await findDeal(pool, idParam(req.params.id))
    if (!deal) throw notFound('Сделка не найдена')
    const [messages, contacts] = await Promise.all([
      listMessages(pool, { dealId: deal.id }),
      listContacts(pool, deal.client.id),
    ])
    res.json({ deal, messages, contacts, replyUnavailableReason: replyBlocker(deal, contacts, channels) })
  })

  router.patch('/:id', async (req, res) => {
    const deal = await updateDeal(pool, idParam(req.params.id), updateSchema.parse(req.body ?? {}))
    res.json({ deal })
  })

  router.post('/:id/read', async (req, res) => {
    await markDealRead(pool, idParam(req.params.id))
    res.status(204).end()
  })

  router.post('/:id/messages', async (req, res) => {
    const { text } = replySchema.parse(req.body ?? {})
    const message = await replyToClient(pool, channels, { dealId: idParam(req.params.id), text, author: req.user })
    res.status(201).json({ message })
  })

  return router
}
