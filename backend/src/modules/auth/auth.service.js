import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../../config.js'
import { unauthorized } from '../../errors.js'
import { findUserByLoginOrEmail, toPublicUser } from '../users/users.repository.js'

const BCRYPT_ROUNDS = 10
// Сравниваем с фиктивным хешем, когда пользователя нет, чтобы время ответа не выдавало существование логина
const DUMMY_HASH = bcrypt.hashSync('no-such-user', BCRYPT_ROUNDS)

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS)

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl })
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret)
}

export async function login(db, { login, password }) {
  const user = await findUserByLoginOrEmail(db, login.trim())
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !passwordOk) throw unauthorized('Неверный логин или пароль')
  if (!user.is_active) throw unauthorized('Учетная запись заблокирована. Обратитесь к администратору.')
  return { token: signToken(user), user: toPublicUser(user) }
}
