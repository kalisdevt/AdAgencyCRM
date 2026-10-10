import { notFound } from './errors.js'

// Идентификатор из адреса: нечисловое значение означает несуществующую запись
export function idParam(value) {
  if (!/^\d{1,15}$/.test(value)) throw notFound()
  return Number(value)
}
