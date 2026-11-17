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

async function send(method, path, { body, headers } = {}) {
  try {
    return await fetch(BASE_URL + path, {
      method,
      headers: { ...headers, ...(token && { Authorization: `Bearer ${token}` }) },
      body,
    })
  } catch {
    throw new ApiError(0, { code: 'network_error', message: 'Нет связи с сервером. Проверьте подключение и повторите.' })
  }
}

async function failure(response) {
  let data = null
  try {
    data = await response.json()
  } catch {
    // не-JSON ответ (например, от прокси)
  }
  if (response.status === 401 && token) onUnauthorized()
  if (response.status === 413) return new ApiError(413, { message: 'Файл слишком большой' })
  return new ApiError(response.status, data?.error ?? { message: `Ошибка сервера (${response.status})` })
}

async function request(method, path, body) {
  const response = await send(method, path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })

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

// Файл уходит телом запроса как есть, имя — в заголовке X-File-Name
async function upload(path, file) {
  const response = await send('POST', path, {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
  })
  if (!response.ok) throw await failure(response)
  return response.json()
}

// Файлы защищены токеном, поэтому браузер получает их через fetch, а не прямой ссылкой
async function blob(path) {
  const response = await send('GET', path)
  if (!response.ok) throw await failure(response)
  return response.blob()
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload,
  blob,
}
