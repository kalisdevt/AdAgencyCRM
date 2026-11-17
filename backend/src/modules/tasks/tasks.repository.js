import { toFile } from '../files/files.service.js'

const TASK_SELECT = `
  SELECT t.id, t.deal_id, t.title, t.description, t.status, t.due_date, t.created_at, t.updated_at,
         t.assignee_id, a.full_name AS assignee_name, ar.name AS assignee_role,
         t.author_id, au.full_name AS author_name,
         d.title AS deal_title, d.stage AS deal_stage, d.client_id, c.name AS client_name,
         (t.status <> 'done' AND t.due_date < current_date) AS is_overdue,
         (SELECT count(*)::int FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', f.id, 'original_name', f.original_name, 'mime_type', f.mime_type,
                    'size_bytes', f.size_bytes, 'uploaded_by', f.uploaded_by, 'uploader_name', fu.full_name,
                    'task_id', f.task_id, 'created_at', f.created_at) ORDER BY f.created_at, f.id)
             FROM files f LEFT JOIN users fu ON fu.id = f.uploaded_by
            WHERE f.task_id = t.id), '[]') AS files
    FROM tasks t
    JOIN users a ON a.id = t.assignee_id
    JOIN roles ar ON ar.id = a.role_id
    JOIN users au ON au.id = t.author_id
    JOIN deals d ON d.id = t.deal_id
    JOIN clients c ON c.id = d.client_id`

export function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignee: { id: row.assignee_id, fullName: row.assignee_name, roleName: row.assignee_role },
    author: { id: row.author_id, fullName: row.author_name },
    deal: { id: row.deal_id, title: row.deal_title, stage: row.deal_stage },
    client: { id: row.client_id, name: row.client_name },
    commentCount: row.comment_count,
    files: row.files.map(toFile),
  }
}

export async function findTask(db, id) {
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [id])
  return rows[0] ? toTask(rows[0]) : null
}

// Невыполненные задачи — сначала, затем по сроку; без срока — в конце
export async function listTasks(db, { dealId, status, involvedUserId, assigneeId, open } = {}) {
  const where = []
  const params = []
  const add = (sql, value) => {
    params.push(value)
    where.push(sql.replaceAll('?', `$${params.length}`))
  }
  if (dealId) add('t.deal_id = ?', dealId)
  if (status) add('t.status = ?', status)
  if (assigneeId) add('t.assignee_id = ?', assigneeId)
  if (involvedUserId) add('(t.assignee_id = ? OR t.author_id = ?)', involvedUserId)
  if (open) where.push(`t.status <> 'done'`)

  const { rows } = await db.query(
    `${TASK_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC, t.id DESC
     LIMIT 300`,
    params,
  )
  return rows.map(toTask)
}

export async function listComments(db, taskId) {
  const { rows } = await db.query(
    `SELECT cm.id, cm.body, cm.created_at, cm.author_id, u.full_name AS author_name
       FROM comments cm JOIN users u ON u.id = cm.author_id
      WHERE cm.task_id = $1
      ORDER BY cm.created_at, cm.id`,
    [taskId],
  )
  return rows.map(toComment)
}

export function toComment(row) {
  return {
    id: row.id,
    text: row.body,
    author: { id: row.author_id, fullName: row.author_name },
    createdAt: row.created_at,
  }
}
