// Приводит телефон к виду +79991234567, чтобы один и тот же номер,
// записанный по-разному, находил одного клиента. Некорректный номер — null.
export function normalizePhone(value) {
  if (!value) return null
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length < 11 || digits.length > 15) return null
  return `+${digits}`
}

export function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : null
}
