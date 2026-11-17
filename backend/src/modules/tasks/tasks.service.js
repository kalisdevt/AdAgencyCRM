import { withTransaction } from '../../db/pool.js'
import { badRequest, forbidden, notFound } from '../../errors.js'
import { OVERSIGHT_ROLES, SALES_ROLES, STAFF_ROLES } from '../../roles.js'
import { saveFile } from '../files/files.service.js'
import { notify } from '../notifications/notifications.js'
import { findTask, listComments, toComment } from './tasks.repository.js'

// Статусы задачи (FR-TASK-03)
export const TASK_STATUSES = [
  { code: 'new', name: 'Новая' },
  { code: 'in_progress', name: 'В работе' },
  { code: 'review', name: 'На согласовании' },
  { code: 'done', name: 'Готово' },
]
export const TASK_STATUS_CODES = TASK_STATUSES.map((status) => status.code)
const statusName = (code) => TASK_STATUSES.find((status) => status.code === code)?.name ?? code

const taskLink = (id) => `/tasks/${id}`

// Участники задачи — исполнитель и постановщик; руководящие роли видят все задачи
export function canViewTask(user, task) {
  return OVERSIGHT_ROLES.includes(user.role) || task.assignee.id === user.id || task.author.id === user.id
}

// Менять содержание задачи могут постановщик и сотрудники отдела продаж
function canEditTask(user, task) {
  return SALES_ROLES.includes(user.role) || task.author.id === user.id
}

export async function requireTask(db, id, user) {
  const task = await findTask(db, id)
  // Чужая задача для сотрудника без доступа выглядит как несуществующая
  if (!task || !canViewTask(user, task)) throw notFound('Задача не найдена')
  return task
}

async function assertAssignee(db, assigneeId) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.is_active AND r.code = ANY($2)`,
    [assigneeId, STAFF_ROLES],
  )
  if (!rowCount) throw badRequest('Исполнителем можно назначить только действующего сотрудника')
}

// Создание задачи из карточки сделки (FR-TASK-01) с уведомлением исполнителя (FR-TASK-02)
export async function createTask(pool, data, author) {
  return withTransaction(pool, async (db) => {
    const deal = await db.query(
      `SELECT d.id, d.title, c.name AS client_name FROM deals d JOIN clients c ON c.id = d.client_id WHERE d.id = $1`,
      [data.dealId],
    )
    if (!deal.rows[0]) throw badRequest('Сделка для задачи не найдена')
    await assertAssignee(db, data.assigneeId)

    const { rows } = await db.query(
      `INSERT INTO tasks (deal_id, title, description, assignee_id, author_id, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.dealId, data.title, data.description ?? null, data.assigneeId, author.id, data.dueDate ?? null],
    )
    const id = rows[0].id
    await notify(
      db,
      [data.assigneeId],
      {
        type: 'task_assigned',
        title: `Новая задача: ${data.title}`,
        body: `${author.fullName} · сделка «${deal.rows[0].title}» (${deal.rows[0].client_name})`,
        link: taskLink(id),
      },
      { except: author.id },
    )
    return findTask(db, id)
  })
}

export async function updateTask(pool, id, changes, user) {
  return withTransaction(pool, async (db) => {
    const task = await requireTask(db, id, user)
    await db.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [id])

    const editsContent = ['title', 'description', 'assigneeId', 'dueDate'].some((key) => changes[key] !== undefined)
    if (editsContent && !canEditTask(user, task)) {
      throw forbidden('Исполнитель может менять только статус задачи')
    }
    if (changes.status !== undefined && !canEditTask(user, task) && task.assignee.id !== user.id) {
      throw forbidden('Статус задачи меняют исполнитель и постановщик')
    }
    if (changes.assigneeId && changes.assigneeId !== task.assignee.id) await assertAssignee(db, changes.assigneeId)

    await db.query(
      `UPDATE tasks
          SET title = $2, description = $3, status = $4, assignee_id = $5, due_date = $6, updated_at = now()
        WHERE id = $1`,
      [
        id,
        changes.title ?? task.title,
        changes.description === undefined ? task.description : changes.description,
        changes.status ?? task.status,
        changes.assigneeId ?? task.assignee.id,
        changes.dueDate === undefined ? task.dueDate : changes.dueDate,
      ],
    )

    const title = changes.title ?? task.title
    if (changes.assigneeId && changes.assigneeId !== task.assignee.id) {
      await notify(
        db,
        [changes.assigneeId],
        { type: 'task_assigned', title: `Новая задача: ${title}`, body: `Назначил(а) ${user.fullName}`, link: taskLink(id) },
        { except: user.id },
      )
    }
    if (changes.status && changes.status !== task.status) {
      await notify(
        db,
        [task.author.id, changes.assigneeId ?? task.assignee.id],
        {
          type: 'task_status',
          title: `«${title}»: ${statusName(changes.status)}`,
          body: `Статус изменил(а) ${user.fullName}`,
          link: taskLink(id),
        },
        { except: user.id },
      )
    }
    return findTask(db, id)
  })
}

// Комментарий к задаче (FR-TASK-03); участники получают уведомление (FR-TASK-02)
export async function addComment(pool, id, text, user) {
  return withTransaction(pool, async (db) => {
    const task = await requireTask(db, id, user)
    const { rows } = await db.query(
      `INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at, author_id`,
      [id, user.id, text],
    )
    await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [id])
    await notify(
      db,
      [task.author.id, task.assignee.id],
      { type: 'task_comment', title: `Комментарий к задаче «${task.title}»`, body: `${user.fullName}: ${text}`, link: taskLink(id) },
      { except: user.id },
    )
    return toComment({ ...rows[0], author_name: user.fullName })
  })
}

// Загрузка макета или вложения в задачу (FR-TASK-01, 03). Файл привязан и к сделке —
// так он виден в карточке сделки.
export async function addTaskFile(pool, storage, id, { content, name }, user) {
  const task = await requireTask(pool, id, user)
  const file = await saveFile(pool, storage, { content, name, uploadedBy: user, taskId: id, dealId: task.deal.id })
  await withTransaction(pool, async (db) => {
    await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [id])
    await notify(
      db,
      [task.author.id, task.assignee.id],
      { type: 'task_file', title: `Новый файл в задаче «${task.title}»`, body: `${user.fullName}: ${file.name}`, link: taskLink(id) },
      { except: user.id },
    )
  })
  return file
}

export async function loadTaskCard(pool, id, user) {
  const task = await requireTask(pool, id, user)
  return { task, comments: await listComments(pool, id), canEdit: canEditTask(user, task) }
}
