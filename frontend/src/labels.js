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
