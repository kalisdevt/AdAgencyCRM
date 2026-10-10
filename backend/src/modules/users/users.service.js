import { badRequest, conflict, notFound } from '../../errors.js'
import { hashPassword } from '../auth/auth.service.js'
import { findUserById, toPublicUser } from './users.repository.js'

async function roleIdByCode(db, code) {
  const { rows } = await db.query('SELECT id FROM roles WHERE code = $1', [code])
  if (!rows[0]) throw badRequest('Неизвестная роль')
  return rows[0].id
}

async function assertClientExists(db, clientId) {
  const { rowCount } = await db.query('SELECT 1 FROM clients WHERE id = $1', [clientId])
  if (!rowCount) throw badRequest('Клиент для учетной записи не найден')
}

function rethrowUnique(error) {
  if (error.code !== '23505') throw error
  if (error.constraint === 'users_login_key') throw conflict('Пользователь с таким логином уже существует')
  if (error.constraint === 'users_email_key') throw conflict('Пользователь с такой почтой уже существует')
  throw error
}

export async function createUser(db, data) {
  if (data.role === 'client' && !data.clientId) {
    throw badRequest('Для роли «Клиент» укажите карточку клиента')
  }
  const roleId = await roleIdByCode(db, data.role)
  const clientId = data.role === 'client' ? data.clientId : null
  if (clientId) await assertClientExists(db, clientId)

  try {
    const { rows } = await db.query(
      `INSERT INTO users (login, email, full_name, password_hash, role_id, client_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.login, data.email ?? null, data.fullName, await hashPassword(data.password), roleId, clientId],
    )
    return toPublicUser(await findUserById(db, rows[0].id))
  } catch (error) {
    rethrowUnique(error)
  }
}

export async function updateUser(db, id, data, actor) {
  const current = await findUserById(db, id)
  if (!current) throw notFound('Пользователь не найден')

  // Администратор не может лишить себя доступа: иначе систему некому будет настраивать
  if (actor.id === id) {
    if (data.isActive === false) throw badRequest('Нельзя заблокировать собственную учетную запись')
    if (data.role && data.role !== current.role) throw badRequest('Нельзя изменить собственную роль')
  }

  const role = data.role ?? current.role
  const clientId = role === 'client' ? (data.clientId ?? current.client_id) : null
  if (role === 'client' && !clientId) throw badRequest('Для роли «Клиент» укажите карточку клиента')
  if (clientId && clientId !== current.client_id) await assertClientExists(db, clientId)

  try {
    await db.query(
      `UPDATE users
          SET full_name = $2, email = $3, role_id = $4, client_id = $5, is_active = $6,
              password_hash = COALESCE($7, password_hash)
        WHERE id = $1`,
      [
        id,
        data.fullName ?? current.full_name,
        data.email === undefined ? current.email : data.email,
        await roleIdByCode(db, role),
        clientId,
        data.isActive ?? current.is_active,
        data.password ? await hashPassword(data.password) : null,
      ],
    )
  } catch (error) {
    rethrowUnique(error)
  }
  return toPublicUser(await findUserById(db, id))
}
