import { ZodError } from 'zod'
import { HttpError } from '../errors.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Маршрут не найден' } })
}

// Четвертый параметр обязателен: по нему Express отличает обработчик ошибок
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
    const message = details.map((item) => item.message).join('; ')
    return res.status(400).json({ error: { code: 'validation_error', message, details } })
  }
  if (error instanceof HttpError) {
    return res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, details: error.details } })
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'validation_error', message: 'Тело запроса не является корректным JSON' } })
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Слишком большой запрос' } })
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, error)
  res.status(500).json({ error: { code: 'internal_error', message: 'Внутренняя ошибка сервера. Попробуйте позже.' } })
}
