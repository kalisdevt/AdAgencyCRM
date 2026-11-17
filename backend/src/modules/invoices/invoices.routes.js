import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../../errors.js'
import { idParam } from '../../validation.js'
import { sendFile } from '../files/files.service.js'
import { createInvoice, findInvoice, INVOICE_STATUSES, listInvoices, sendInvoiceToClient, setInvoiceStatus } from './invoices.service.js'

const createSchema = z.object({
  dealId: z.number({ error: 'Не указана сделка' }).int().positive(),
  description: z.string().trim().max(500, 'Описание услуги длиннее 500 символов').nullish(),
})

const statusSchema = z.object({
  status: z.enum(INVOICE_STATUSES.map((status) => status.code), { error: 'Неизвестный статус счета' }),
})

const listSchema = z.object({
  dealId: z.string({ error: 'Укажите сделку' }).regex(/^\d{1,15}$/, 'Некорректная сделка'),
})

// Счета (FR-DOC-01–03): доступны отделу продаж
export function invoicesRoutes({ pool, storage, channels }) {
  const router = Router()

  router.get('/', async (req, res) => {
    const { dealId } = listSchema.parse(req.query)
    res.json({ items: await listInvoices(pool, { dealId: Number(dealId) }) })
  })

  router.post('/', async (req, res) => {
    const invoice = await createInvoice(pool, storage, createSchema.parse(req.body ?? {}), req.user)
    res.status(201).json({ invoice })
  })

  router.patch('/:id', async (req, res) => {
    const { status } = statusSchema.parse(req.body ?? {})
    res.json(await setInvoiceStatus(pool, idParam(req.params.id), status, req.user))
  })

  router.get('/:id/pdf', async (req, res) => {
    const invoice = await findInvoice(pool, idParam(req.params.id))
    if (!invoice) throw notFound('Счет не найден')
    const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [invoice.fileId])
    await sendFile(res, storage, rows[0], { download: req.query.download === '1' })
  })

  router.post('/:id/send', async (req, res) => {
    const invoice = await sendInvoiceToClient(pool, channels, storage, idParam(req.params.id), req.user)
    res.json({ invoice })
  })

  return router
}
