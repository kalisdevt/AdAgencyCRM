import { forbidden, unauthorized } from '../errors.js'
import { verifyToken } from '../modules/auth/auth.service.js'
import { findUserById, toPublicUser } from '../modules/users/users.repository.js'

// Проверяет токен и каждый раз читает пользователя из БД,
// чтобы блокировка и смена роли действовали сразу, а не после истечения токена.
export function authenticate(pool) {
  return async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw unauthorized()

    let payload
    try {
      payload = verifyToken(token)
    } catch {
      throw unauthorized('Сессия истекла. Войдите заново.')
    }

    const user = await findUserById(pool, Number(payload.sub))
    if (!user || !user.is_active) throw unauthorized('Учетная запись недоступна')
    req.user = toPublicUser(user)
    next()
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) throw forbidden()
    next()
  }
}
