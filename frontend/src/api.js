const BASE_URL = import.meta.env.VITE_API_URL || '/api'

let token = null
let onUnauthorized = () => {}

export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || 'Не удалось выполнить запрос')
    this.status = status
    this.code = error?.code
    this.details = error?.details
  }
}

export function setToken(value) {
  token = value
}

// Вызывается, когда сервер перестал принимать токен (истек или учетная запись заблокирована)
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function request(method, path, body) {
  let response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { code: 'network_error', message: 'Нет связи с сервером. Проверьте подключение и повторите.' })
  }

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // не-JSON ответ (например, от прокси) обрабатывается ниже как ошибка сервера
  }

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    throw new ApiError(response.status, data?.error ?? { message: `Ошибка сервера (${response.status})` })
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body),
}
