import { Router } from 'express'
import { z } from 'zod'
import { conflict, notFound } from '../../errors.js'
import { requireRole } from '../../middleware/auth.js'
import { SALES_ROLES } from '../../roles.js'
import { idParam } from '../../validation.js'

// Справочники (FR-ADM-02, желательное): причины отказа ведет администратор,
// рекламные кампании — администратор и маркетолог
const CAMPAIGN_EDITORS = ['admin', 'marketer']

const name = z.string({ error: 'Укажите название' }).trim().min(2, 'Название слишком короткое').max(120, 'Название длиннее 120 символов')
const reasonSchema = z.object({ name })
const reasonUpdateSchema = z.object({ name, isActive: z.boolean() }).partial()
const campaignSchema = z.object({
  code: z
    .string({ error: 'Укажите код (значение utm_campaign)' })
    .trim()
    .regex(/^[A-Za-z0-9._-]{2,100}$/, 'Код — латиница, цифры, точка, дефис, подчеркивание (как в utm_campaign)'),
  name,
})
const campaignUpdateSchema = z.object({ name, isActive: z.boolean() }).partial()

function rethrowUnique(error, message) {
  if (error.code === '23505') throw conflict(message)
  throw error
}

const toReason = (row) => ({ id: row.id, name: row.name, isActive: row.is_active })
const toCampaign = (row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active })

export function dictionariesRoutes({ pool }) {
  const router = Router()

  router.get('/refusal-reasons', requireRole('admin'), async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM refusal_reasons ORDER BY is_active DESC, id')
    res.json({ items: rows.map(toReason) })
  })

  router.post('/refusal-reasons', requireRole('admin'), async (req, res) => {
    const data = reasonSchema.parse(req.body ?? {})
    try {
      const { rows } = await pool.query('INSERT INTO refusal_reasons (name) VALUES ($1) RETURNING *', [data.name])
      res.status(201).json({ item: toReason(rows[0]) })
    } catch (error) {
      rethrowUnique(error, 'Такая причина уже есть')
    }
  })

  router.patch('/refusal-reasons/:id', requireRole('admin'), async (req, res) => {
    const data = reasonUpdateSchema.parse(req.body ?? {})
    try {
      const { rows } = await pool.query(
        `UPDATE refusal_reasons SET name = COALESCE($2, name), is_active = COALESCE($3, is_active) WHERE id = $1 RETURNING *`,
        [idParam(req.params.id), data.name ?? null, data.isActive ?? null],
      )
      if (!rows[0]) throw notFound('Причина не найдена')
      res.json({ item: toReason(rows[0]) })
    } catch (error) {
      rethrowUnique(error, 'Такая причина уже есть')
    }
  })

  // Список кампаний нужен и отделу продаж — для выбора кампании в сделке (FR-DEAL-02)
  router.get('/campaigns', requireRole(...new Set([...CAMPAIGN_EDITORS, ...SALES_ROLES, 'director'])), async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM campaigns ORDER BY is_active DESC, name')
    res.json({ items: rows.map(toCampaign) })
  })

  router.post('/campaigns', requireRole(...CAMPAIGN_EDITORS), async (req, res) => {
    const data = campaignSchema.parse(req.body ?? {})
    try {
      const { rows } = await pool.query('INSERT INTO campaigns (code, name) VALUES ($1, $2) RETURNING *', [data.code, data.name])
      res.status(201).json({ item: toCampaign(rows[0]) })
    } catch (error) {
      rethrowUnique(error, 'Кампания с таким кодом уже есть')
    }
  })

  router.patch('/campaigns/:id', requireRole(...CAMPAIGN_EDITORS), async (req, res) => {
    const data = campaignUpdateSchema.parse(req.body ?? {})
    const { rows } = await pool.query(
      `UPDATE campaigns SET name = COALESCE($2, name), is_active = COALESCE($3, is_active) WHERE id = $1 RETURNING *`,
      [idParam(req.params.id), data.name ?? null, data.isActive ?? null],
    )
    if (!rows[0]) throw notFound('Кампания не найдена')
    res.json({ item: toCampaign(rows[0]) })
  })

  return router
}
