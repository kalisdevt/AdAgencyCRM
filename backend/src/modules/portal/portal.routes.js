import { Router } from 'express'
import { notFound } from '../../errors.js'
import { idParam } from '../../validation.js'
import { sendFile } from '../files/files.service.js'
import { listInvoices } from '../invoices/invoices.service.js'
import { findProject, listProjects } from '../projects/projects.repository.js'

// Статусы заявок, понятные клиенту (внутренние стадии воронки ему не показываются)
const CLIENT_STAGE_NAMES = {
  new: 'Заявка принята',
  qualification: 'Уточняем детали',
  proposal_prep: 'Готовим предложение',
  proposal_sent: 'Предложение отправлено',
  invoiced: 'Ожидает оплаты',
}

// Только то, что нужно клиенту: без внутренних комментариев, ответственных и переписки
function toClientProject(project) {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    completedAt: project.completedAt,
    amount: project.deal.amount,
    manager: project.manager ? { fullName: project.manager.fullName } : null,
    currentStage: project.currentStage,
    progress: project.progress,
    stages: project.stages.map((stage) => ({ code: stage.code, name: stage.name, isDone: stage.isDone, doneAt: stage.doneAt })),
  }
}

const toClientInvoice = (invoice) => ({
  id: invoice.id,
  number: invoice.number,
  amount: invoice.amount,
  status: invoice.status,
  issuedAt: invoice.issuedAt,
  paidAt: invoice.paidAt,
  description: invoice.description,
})

// Личный кабинет клиента (FR-PORT-01, 02). Клиент видит только данные своей карточки:
// идентификатор берется из учетной записи, а не из запроса (ТЗ п. 4.7).
export function portalRoutes({ pool, storage }) {
  const router = Router()

  router.get('/', async (req, res) => {
    const clientId = req.user.clientId
    const [client, projects, deals, invoices] = await Promise.all([
      pool.query('SELECT name, company FROM clients WHERE id = $1', [clientId]),
      listProjects(pool, { clientId }),
      pool.query(
        `SELECT id, title, stage, amount, created_at FROM deals
          WHERE client_id = $1 AND stage NOT IN ('paid', 'refused')
          ORDER BY created_at DESC`,
        [clientId],
      ),
      listInvoices(pool, { clientId }),
    ])
    res.json({
      client: client.rows[0] ?? null,
      // текущие заказы: заявки до оплаты и проекты в работе
      orders: deals.rows.map((deal) => ({
        id: deal.id,
        title: deal.title,
        status: CLIENT_STAGE_NAMES[deal.stage],
        amount: deal.amount,
        createdAt: deal.created_at,
      })),
      activeProjects: projects.filter((project) => project.status === 'active').map(toClientProject),
      // архив завершенных проектов (FR-PORT-02)
      archive: projects.filter((project) => project.status === 'completed').map(toClientProject),
      invoices: invoices.map(toClientInvoice),
    })
  })

  router.get('/projects/:id', async (req, res) => {
    const project = await findProject(pool, idParam(req.params.id))
    // Чужой проект для клиента не существует
    if (!project || project.client.id !== req.user.clientId) throw notFound('Проект не найден')
    res.json({ project: toClientProject(project) })
  })

  router.get('/invoices/:id/pdf', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.* FROM invoices i
         JOIN deals d ON d.id = i.deal_id
         JOIN files f ON f.id = i.file_id
        WHERE i.id = $1 AND d.client_id = $2`,
      [idParam(req.params.id), req.user.clientId],
    )
    if (!rows[0]) throw notFound('Счет не найден')
    await sendFile(res, storage, rows[0], { download: req.query.download === '1' })
  })

  return router
}
