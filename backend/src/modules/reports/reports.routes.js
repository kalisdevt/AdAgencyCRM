import { Router } from 'express'
import { z } from 'zod'
import { badRequest, notFound } from '../../errors.js'
import { requireRole } from '../../middleware/auth.js'
import { idParam } from '../../validation.js'
import { CSV_LAYOUTS, toCsv } from './csv.js'
import { channelsReport, managersReport, REPORT_TIMEZONE, refusalsReport, revenueReport } from './reports.service.js'

const CHANNEL_NAMES = { telegram: 'Telegram', web: 'Сайт', vk: 'ВКонтакте', manual: 'Вручную' }

// Кто какие отчеты видит (ТЗ п. 4.1.2): маркетолог — каналы и отказы;
// руководитель отдела продаж и директор — еще KPI и ожидаемую выручку
export const REPORT_ACCESS = {
  channels: ['admin', 'sales_head', 'marketer', 'director'],
  refusals: ['admin', 'sales_head', 'marketer', 'director'],
  managers: ['admin', 'sales_head', 'director'],
  revenue: ['admin', 'sales_head', 'director'],
}
export const REPORT_ROLES = [...new Set(Object.values(REPORT_ACCESS).flat())]
export const EXPENSE_ROLES = ['admin', 'marketer']

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД').refine((value) => !Number.isNaN(Date.parse(value)), 'Некорректная дата')

// Период по умолчанию — с начала текущего месяца по сегодня
function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: REPORT_TIMEZONE }).format(new Date())
}

function parsePeriod(query) {
  const { from, to } = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(query)
  const end = to ?? today()
  const start = from ?? `${end.slice(0, 7)}-01`
  if (start > end) throw badRequest('Начало периода позже его окончания')
  return { from: start, to: end }
}

const BUILDERS = {
  channels: async (pool, period) => {
    const report = await channelsReport(pool, period)
    report.channels = report.channels.map((row) => ({ ...row, channelName: CHANNEL_NAMES[row.channel] ?? row.channel }))
    return report
  },
  refusals: async (pool, period) => {
    const report = await refusalsReport(pool, period)
    const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: REPORT_TIMEZONE })
    report.deals = report.deals.map((row) => ({ ...row, date: dateFormat.format(row.closedAt) }))
    return report
  },
  managers: (pool, period) => managersReport(pool, period),
  revenue: (pool) => revenueReport(pool),
}

function requireReportAccess(req, type) {
  if (!BUILDERS[type]) throw notFound('Отчет не найден')
  return requireRole(...REPORT_ACCESS[type])
}

const expenseSchema = z.object({
  campaignId: z.number({ error: 'Выберите кампанию' }).int().positive(),
  spentOn: isoDate,
  amount: z.number({ error: 'Укажите сумму расхода' }).positive('Сумма расхода должна быть больше нуля').max(9_999_999_999, 'Слишком большая сумма'),
  comment: z.string().trim().max(500, 'Комментарий длиннее 500 символов').nullish(),
})

export function reportsRoutes({ pool }) {
  const router = Router()

  // Доступные текущему пользователю отчеты — для вкладок интерфейса
  router.get('/', (req, res) => {
    res.json({
      reports: Object.keys(REPORT_ACCESS).filter((type) => REPORT_ACCESS[type].includes(req.user.role)),
      canEditExpenses: EXPENSE_ROLES.includes(req.user.role),
      period: parsePeriod({}),
    })
  })

  // Расходы на кампании (FR-AN-02, желательное)
  router.get('/expenses', async (req, res) => {
    const period = parsePeriod(req.query)
    const { rows } = await pool.query(
      `SELECT e.id, e.spent_on, e.amount, e.comment, e.created_at, c.id AS campaign_id, c.name AS campaign_name, u.full_name AS author
         FROM campaign_expenses e
         JOIN campaigns c ON c.id = e.campaign_id
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.spent_on BETWEEN $1 AND $2
        ORDER BY e.spent_on DESC, e.id DESC`,
      [period.from, period.to],
    )
    res.json({
      items: rows.map((row) => ({
        id: row.id,
        spentOn: row.spent_on,
        amount: row.amount,
        comment: row.comment,
        campaign: { id: row.campaign_id, name: row.campaign_name },
        author: row.author,
      })),
    })
  })

  router.post('/expenses', requireRole(...EXPENSE_ROLES), async (req, res) => {
    const data = expenseSchema.parse(req.body ?? {})
    const campaign = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [data.campaignId])
    if (!campaign.rowCount) throw badRequest('Кампания не найдена')
    const { rows } = await pool.query(
      `INSERT INTO campaign_expenses (campaign_id, spent_on, amount, comment, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [data.campaignId, data.spentOn, data.amount, data.comment || null, req.user.id],
    )
    res.status(201).json({ id: rows[0].id })
  })

  router.delete('/expenses/:id', requireRole(...EXPENSE_ROLES), async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM campaign_expenses WHERE id = $1', [idParam(req.params.id)])
    if (!rowCount) throw notFound('Расход не найден')
    res.status(204).end()
  })

  router.get('/:type', (req, res, next) => requireReportAccess(req, req.params.type)(req, res, next), async (req, res) => {
    const period = parsePeriod(req.query)
    res.json({ period, ...(await BUILDERS[req.params.type](pool, period)) })
  })

  // Выгрузка отчета в CSV (FR-AN-07, желательное)
  router.get('/:type/csv', (req, res, next) => requireReportAccess(req, req.params.type)(req, res, next), async (req, res) => {
    const period = parsePeriod(req.query)
    const report = await BUILDERS[req.params.type](pool, period)
    const { columns, rows } = CSV_LAYOUTS[req.params.type](report)
    const suffix = req.params.type === 'revenue' ? today() : `${period.from}_${period.to}`
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${req.params.type}-${suffix}.csv"`,
    })
    res.send(toCsv(columns, rows))
  })

  return router
}
