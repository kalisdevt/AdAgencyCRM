import { withTransaction } from '../../db/pool.js'
import { badRequest, forbidden, notFound } from '../../errors.js'
import { listContacts } from '../deals/deals.repository.js'
import { notify } from '../notifications/notifications.js'
import { findProject, PROJECT_STAGES, projectStageName } from './projects.repository.js'

// Создание проекта из оплаченной сделки (FR-PROJ-01). Вызывается в транзакции оплаты;
// повторный вызов безопасен — на сделку приходится не больше одного проекта.
export async function ensureProject(db, dealId, actor) {
  const { rows } = await db.query(
    `INSERT INTO projects (deal_id, client_id, title, manager_id)
     SELECT d.id, d.client_id, d.title, COALESCE(d.assignee_id, $2) FROM deals d WHERE d.id = $1
     ON CONFLICT (deal_id) DO NOTHING
     RETURNING id, title, manager_id`,
    [dealId, actor?.id ?? null],
  )
  if (!rows[0]) {
    const existing = await db.query('SELECT id FROM projects WHERE deal_id = $1', [dealId])
    return { id: existing.rows[0]?.id ?? null, created: false }
  }
  const project = rows[0]
  await db.query(
    `INSERT INTO project_stages (project_id, code, position)
     SELECT $1, code, position FROM unnest($2::text[]) WITH ORDINALITY AS stage(code, position)`,
    [project.id, PROJECT_STAGES.map((stage) => stage.code)],
  )
  await notify(
    db,
    [project.manager_id],
    { type: 'project_created', title: `Создан проект «${project.title}»`, body: 'Счет оплачен — отмечайте выполнение этапов', link: `/projects/${project.id}` },
    { except: actor?.id },
  )
  return { id: project.id, created: true }
}

// Этапы отмечает ответственный за проект, руководитель отдела продаж или администратор
function canMarkStages(user, project) {
  return ['admin', 'sales_head'].includes(user.role) || project.manager?.id === user.id
}

export function projectPermissions(user, project) {
  return { canMarkStages: canMarkStages(user, project) }
}

// Отметка выполнения этапа (FR-PROJ-01). Этапы идут по порядку: выполнить можно только
// следующий этап, отменить — только последний выполненный.
export async function setStage(pool, projectId, code, done, user) {
  const result = await withTransaction(pool, async (db) => {
    // Сначала блокировка, потом чтение: иначе параллельные запросы (двойной клик) проверяли бы
    // порядок этапов по устаревшему состоянию и могли отметить этап дважды или не по порядку
    await db.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId])
    const project = await findProject(db, projectId)
    if (!project) throw notFound('Проект не найден')
    if (!canMarkStages(user, project)) throw forbidden('Этапы отмечает ответственный менеджер проекта')

    const index = project.stages.findIndex((stage) => stage.code === code)
    if (index < 0) throw notFound('Этап не найден')
    const stage = project.stages[index]
    if (stage.isDone === done) return { project, changed: false }

    if (done && project.stages.slice(0, index).some((item) => !item.isDone)) {
      throw badRequest(`Сначала отметьте предыдущий этап «${project.stages.find((item) => !item.isDone).name}»`)
    }
    if (!done && project.stages.slice(index + 1).some((item) => item.isDone)) {
      throw badRequest('Отменить можно только последний выполненный этап')
    }

    await db.query(
      `UPDATE project_stages SET is_done = $3, done_at = $4, done_by = $5 WHERE project_id = $1 AND code = $2`,
      [projectId, code, done, done ? new Date() : null, done ? user.id : null],
    )
    const completed = done && code === 'completed'
    await db.query(
      `UPDATE projects SET status = $2, completed_at = $3, updated_at = now() WHERE id = $1`,
      [projectId, completed ? 'completed' : 'active', completed ? new Date() : null],
    )
    return { project: await findProject(db, projectId), changed: true }
  })
  return result
}

// Уведомление клиента о смене этапа в канал, из которого он обращался (FR-PROJ-03).
// Не мешает отметке этапа: при недоступном канале возвращается причина.
export async function notifyClientAboutStage(pool, channels, project, code) {
  const { rows } = await pool.query('SELECT source_channel FROM deals WHERE id = $1', [project.deal.id])
  const channel = rows[0]?.source_channel
  const adapter = channels.get(channel)
  if (!adapter?.canReply) return { sent: false, reason: 'канал обращения не поддерживает сообщения из системы' }
  if (!adapter.isConfigured) return { sent: false, reason: `${adapter.title}: канал не подключен на сервере` }
  const contacts = await listContacts(pool, project.client.id)
  const contact = contacts.find((item) => item.channel === channel)
  if (!contact) return { sent: false, reason: 'у клиента нет контакта в канале обращения' }

  const text = stageMessage(project, code)
  try {
    const sent = await adapter.sendMessage(contact, text)
    await pool.query(
      `INSERT INTO messages (deal_id, client_id, channel, direction, external_id, body, is_read)
       VALUES ($1, $2, $3, 'out', $4, $5, true)`,
      [project.deal.id, project.client.id, channel, sent?.externalMessageId ?? null, text],
    )
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: error.message }
  }
}

// Текст уведомления клиенту о смене этапа (FR-PROJ-03)
export function stageMessage(project, code) {
  if (code === 'completed') return `Здравствуйте! Ваш проект «${project.title}» завершен. Спасибо, что выбрали наше агентство!`
  const next = project.stages.find((stage) => !stage.isDone)
  const nextText = next ? ` Следующий этап — «${projectStageName(next.code)}».` : ''
  return `Здравствуйте! По проекту «${project.title}» выполнен этап «${projectStageName(code)}».${nextText}`
}
