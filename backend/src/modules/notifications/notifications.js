import { Router } from 'express'
import { notFound } from '../../errors.js'
import { idParam } from '../../validation.js'

// Уведомления внутри Системы (FR-TASK-02): создаются вместе с событием, в той же транзакции.
// Автору события уведомление не отправляется.
export async function notify(db, recipientIds, { type, title, body = null, link = null }, { except } = {}) {
  const ids = [...new Set(recipientIds.filter((id) => id && id !== except))]
  if (!ids.length) return
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE id = ANY($1) AND is_active`,
    [ids, type, title, body ? body.slice(0, 300) : null, link],
  )
}

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

export function notificationsRoutes({ pool }) {
  const router = Router()

  router.get('/', async (req, res) => {
    const [list, unread] = await Promise.all([
      pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`,
        [req.user.id],
      ),
      pool.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read`, [req.user.id]),
    ])
    res.json({ items: list.rows.map(toNotification), unread: unread.rows[0].n })
  })

  // Легкий запрос для счетчика в меню
  router.get('/unread-count', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read`,
      [req.user.id],
    )
    res.json({ unread: rows[0].n })
  })

  router.post('/read-all', async (req, res) => {
    await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read`, [req.user.id])
    res.status(204).end()
  })

  router.post('/:id/read', async (req, res) => {
    const { rowCount } = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [idParam(req.params.id), req.user.id],
    )
    if (!rowCount) throw notFound('Уведомление не найдено')
    res.status(204).end()
  })

  return router
}
