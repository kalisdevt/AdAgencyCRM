export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, details) => new HttpError(400, 'validation_error', message, details)
export const unauthorized = (message = 'Требуется вход в систему') => new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'Недостаточно прав для этого действия') => new HttpError(403, 'forbidden', message)
export const notFound = (message = 'Запись не найдена') => new HttpError(404, 'not_found', message)
export const conflict = (message) => new HttpError(409, 'conflict', message)
