export const STAGES = [
  { code: 'new', name: 'Новый' },
  { code: 'qualification', name: 'Квалификация' },
  { code: 'proposal_prep', name: 'Подготовка КП' },
  { code: 'proposal_sent', name: 'КП отправлено' },
  { code: 'invoiced', name: 'Счет выставлен' },
  { code: 'paid', name: 'Оплачено' },
  { code: 'refused', name: 'Отказ' },
]

export const CHANNELS = [
  { code: 'telegram', name: 'Telegram' },
  { code: 'web', name: 'Сайт' },
]

const stageNames = Object.fromEntries(STAGES.map((stage) => [stage.code, stage.name]))
const channelNames = { telegram: 'Telegram', web: 'Сайт', vk: 'ВКонтакте', manual: 'Вручную' }

export const stageName = (code) => stageNames[code] ?? code
export const channelName = (code) => channelNames[code] ?? code

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const fullFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const moneyFormat = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })

// Сегодняшние сообщения — время, более старые — дата
export function shortTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dayFormat.format(date)
}

export const fullTime = (value) => (value ? fullFormat.format(new Date(value)) : '')
export const money = (value) => moneyFormat.format(value ?? 0)

export const TASK_STATUSES = [
  { code: 'new', name: 'Новая' },
  { code: 'in_progress', name: 'В работе' },
  { code: 'review', name: 'На согласовании' },
  { code: 'done', name: 'Готово' },
]
const taskStatusNames = Object.fromEntries(TASK_STATUSES.map((status) => [status.code, status.name]))
export const taskStatusName = (code) => taskStatusNames[code] ?? code

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
// Дата без времени (ГГГГ-ММ-ДД) — без сдвига часового пояса
export function dateLabel(value) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return dateFormat.format(new Date(year, month - 1, day))
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}

// Допустимые форматы файлов задач (проверяются и на сервере)
export const FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.psd,.ai,.eps,.cdr,.tif,.tiff,.docx,.xlsx,.txt'
