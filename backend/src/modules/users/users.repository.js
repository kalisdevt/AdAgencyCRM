const USER_SELECT = `
  SELECT u.id, u.login, u.email, u.full_name, u.password_hash, u.is_active, u.client_id, u.created_at,
         r.code AS role, r.name AS role_name
    FROM users u
    JOIN roles r ON r.id = u.role_id`

// Наружу отдаем пользователя без хеша пароля
export function toPublicUser(row) {
  return {
    id: row.id,
    login: row.login,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    roleName: row.role_name,
    clientId: row.client_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

export async function findUserById(db, id) {
  const { rows } = await db.query(`${USER_SELECT} WHERE u.id = $1`, [id])
  return rows[0] ?? null
}

export async function findUserByLoginOrEmail(db, value) {
  const { rows } = await db.query(
    `${USER_SELECT} WHERE lower(u.login) = lower($1) OR lower(u.email) = lower($1)`,
    [value],
  )
  return rows[0] ?? null
}

export async function listUsers(db, { roles } = {}) {
  const params = []
  let where = ''
  if (roles?.length) {
    params.push(roles)
    where = 'WHERE r.code = ANY($1)'
  }
  const { rows } = await db.query(`${USER_SELECT} ${where} ORDER BY u.full_name`, params)
  return rows
}

export async function listRoles(db) {
  const { rows } = await db.query('SELECT code, name FROM roles ORDER BY id')
  return rows
}
