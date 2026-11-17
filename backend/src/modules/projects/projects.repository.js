// Этапы проекта (FR-PROJ-01) в порядке выполнения
export const PROJECT_STAGES = [
  { code: 'design', name: 'Дизайн' },
  { code: 'approval', name: 'Согласование' },
  { code: 'printing', name: 'Печать' },
  { code: 'placement', name: 'Размещение' },
  { code: 'completed', name: 'Завершен' },
]
export const PROJECT_STAGE_CODES = PROJECT_STAGES.map((stage) => stage.code)
export const projectStageName = (code) => PROJECT_STAGES.find((stage) => stage.code === code)?.name ?? code

const PROJECT_SELECT = `
  SELECT p.id, p.title, p.status, p.created_at, p.updated_at, p.completed_at,
         p.deal_id, d.amount, d.source_channel,
         p.client_id, c.name AS client_name, c.company AS client_company,
         p.manager_id, m.full_name AS manager_name,
         st.stages,
         (SELECT count(*)::int FROM project_stages s WHERE s.project_id = p.id AND s.is_done) AS done_count
    FROM projects p
    JOIN deals d ON d.id = p.deal_id
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN users m ON m.id = p.manager_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'code', s.code, 'isDone', s.is_done, 'doneAt', s.done_at,
               'doneBy', CASE WHEN s.done_by IS NULL THEN NULL ELSE json_build_object('id', s.done_by, 'fullName', u.full_name) END
             ) ORDER BY s.position) AS stages
        FROM project_stages s LEFT JOIN users u ON u.id = s.done_by
       WHERE s.project_id = p.id
    ) st ON true`

export function toProject(row) {
  const stages = (row.stages ?? []).map((stage) => ({ ...stage, name: projectStageName(stage.code) }))
  // Текущий этап — первый невыполненный; у завершенного проекта — «Завершен»
  const current = stages.find((stage) => !stage.isDone) ?? stages.at(-1) ?? null
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deal: { id: row.deal_id, amount: row.amount, channel: row.source_channel },
    client: { id: row.client_id, name: row.client_name, company: row.client_company },
    manager: row.manager_id ? { id: row.manager_id, fullName: row.manager_name } : null,
    stages,
    currentStage: current ? { code: current.code, name: current.name } : null,
    progress: { done: row.done_count, total: stages.length },
  }
}

export async function findProject(db, id) {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id])
  return rows[0] ? toProject(rows[0]) : null
}

export async function listProjects(db, { status, clientId, managerId } = {}) {
  const where = []
  const params = []
  const add = (sql, value) => {
    params.push(value)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (status) add('p.status = ?', status)
  if (clientId) add('p.client_id = ?', clientId)
  if (managerId) add('p.manager_id = ?', managerId)
  const { rows } = await db.query(
    `${PROJECT_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (p.status = 'completed'), p.updated_at DESC, p.id DESC
     LIMIT 500`,
    params,
  )
  return rows.map(toProject)
}
