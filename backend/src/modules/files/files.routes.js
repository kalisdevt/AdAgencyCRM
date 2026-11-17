import { Router } from 'express'
import { notFound } from '../../errors.js'
import { OVERSIGHT_ROLES } from '../../roles.js'
import { idParam } from '../../validation.js'
import { sendFile } from './files.service.js'

// Кто может получить файл: руководящие роли и отдел продаж — любой;
// исполнитель и постановщик задачи — файлы своей задачи.
async function canReadFile(db, user, file) {
  if (OVERSIGHT_ROLES.includes(user.role)) return true
  if (file.task_id) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM tasks WHERE id = $1 AND (assignee_id = $2 OR author_id = $2)',
      [file.task_id, user.id],
    )
    if (rowCount) return true
  }
  return false
}

export function filesRoutes({ pool, storage }) {
  const router = Router()

  router.get('/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [idParam(req.params.id)])
    const file = rows[0]
    // Недоступный файл выглядит как несуществующий
    if (!file || !(await canReadFile(pool, req.user, file))) throw notFound('Файл не найден')
    await sendFile(res, storage, file, { download: req.query.download === '1' })
  })

  return router
}
