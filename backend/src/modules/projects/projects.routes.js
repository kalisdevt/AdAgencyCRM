import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../../errors.js'
import { requireRole } from '../../middleware/auth.js'
import { SALES_ROLES } from '../../roles.js'
import { idParam } from '../../validation.js'
import { listInvoices } from '../invoices/invoices.service.js'
import { findProject, listProjects, PROJECT_STAGES } from './projects.repository.js'
import { notifyClientAboutStage, projectPermissions, setStage } from './projects.service.js'

const listSchema = z.object({
  status: z.enum(['active', 'completed'], { error: 'Неизвестный статус проекта' }).optional(),
  manager: z.literal('me').optional(),
})

const stageSchema = z.object({
  done: z.boolean({ error: 'Укажите, выполнен ли этап' }),
  // уведомить клиента о выполнении этапа в канал обращения (FR-PROJ-03)
  notifyClient: z.boolean().optional(),
})

// Проекты (FR-PROJ-01, 02): панель статусов для руководителя и отметка этапов
export function projectsRoutes({ pool, channels }) {
  const router = Router()

  router.get('/stages', (req, res) => {
    res.json({ items: PROJECT_STAGES })
  })

  router.get('/', async (req, res) => {
    const query = listSchema.parse(req.query)
    const managerId = query.manager ? req.user.id : undefined
    const all = await listProjects(pool, { managerId })
    const items = query.status ? all.filter((project) => project.status === query.status) : all
    // Сводка по этапам для панели руководителя — по всем проектам, независимо от фильтра статуса
    const summary = Object.fromEntries(PROJECT_STAGES.map((stage) => [stage.code, 0]))
    for (const project of all) summary[project.status === 'completed' ? 'completed' : project.currentStage.code] += 1
    res.json({ items, summary })
  })

  router.get('/:id', async (req, res) => {
    const project = await findProject(pool, idParam(req.params.id))
    if (!project) throw notFound('Проект не найден')
    const invoices = await listInvoices(pool, { dealId: project.deal.id })
    res.json({ project, invoices, ...projectPermissions(req.user, project) })
  })

  router.post('/:id/stages/:code', requireRole(...SALES_ROLES), async (req, res) => {
    const { done, notifyClient = true } = stageSchema.parse(req.body ?? {})
    const id = idParam(req.params.id)
    const { project, changed } = await setStage(pool, id, req.params.code, done, req.user)
    let clientNotification = null
    if (changed && done && notifyClient) {
      clientNotification = await notifyClientAboutStage(pool, channels, project, req.params.code)
    }
    res.json({ project, clientNotification, ...projectPermissions(req.user, project) })
  })

  return router
}
