// Экспорт отчетов в CSV (FR-AN-07). Разделитель «;», десятичная запятая и BOM —
// чтобы файл сразу открывался в Excel с русской локалью.

function cell(value) {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  // защита от выполнения формул при открытии в табличном редакторе
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(columns, rows) {
  const lines = [columns.map((column) => cell(column.title)).join(';')]
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(';'))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

const percent = (value) => (value === null || value === undefined ? null : Math.round(value * 1000) / 10)
const money = (value) => (value === null || value === undefined ? null : Math.round(value * 100) / 100)

export const CSV_LAYOUTS = {
  channels: (report) => ({
    columns: [
      { title: 'Раздел', value: (row) => row.section },
      { title: 'Канал / кампания', value: (row) => row.name },
      { title: 'Лиды', value: (row) => row.leads },
      { title: 'Успешные сделки', value: (row) => row.won },
      { title: 'Отказы', value: (row) => row.refused },
      { title: 'Конверсия, %', value: (row) => percent(row.conversion) },
      { title: 'Сумма успешных сделок, ₽', value: (row) => money(row.wonAmount) },
      { title: 'Расходы, ₽', value: (row) => money(row.expenses) },
      { title: 'Стоимость лида, ₽', value: (row) => money(row.costPerLead) },
      { title: 'Стоимость клиента, ₽', value: (row) => money(row.costPerClient) },
    ],
    rows: [
      ...report.channels.map((row) => ({ ...row, section: 'Канал', name: row.channelName })),
      ...report.campaigns.map((row) => ({ ...row, section: 'Кампания' })),
      { ...report.total, section: 'Итого', name: '' },
    ],
  }),
  refusals: (report) => ({
    columns: [
      { title: 'Дата отказа', value: (row) => row.date },
      { title: 'Сделка', value: (row) => row.title },
      { title: 'Клиент', value: (row) => row.client },
      { title: 'Причина', value: (row) => row.reason },
      { title: 'Комментарий', value: (row) => row.comment },
      { title: 'Ответственный', value: (row) => row.assignee },
      { title: 'Сумма, ₽', value: (row) => money(row.amount) },
    ],
    rows: report.deals,
  }),
  managers: (report) => ({
    columns: [
      { title: 'Менеджер', value: (row) => row.fullName },
      { title: 'Лиды', value: (row) => row.leads },
      { title: 'Обработано', value: (row) => row.processed },
      { title: 'Успешные сделки', value: (row) => row.won },
      { title: 'Отказы', value: (row) => row.refused },
      { title: 'Конверсия, %', value: (row) => percent(row.conversion) },
      { title: 'Сумма сделок, ₽', value: (row) => money(row.wonAmount) },
      { title: 'Среднее время первого ответа, мин', value: (row) => row.avgResponseMinutes },
    ],
    rows: report.managers,
  }),
  revenue: (report) => ({
    columns: [
      { title: 'Стадия', value: (row) => row.name },
      { title: 'Открытых сделок', value: (row) => row.count },
      { title: 'Сумма, ₽', value: (row) => money(row.amount) },
      { title: 'Вероятность оплаты, %', value: (row) => percent(row.probability) },
      { title: 'Ожидаемая выручка с учетом вероятности, ₽', value: (row) => money(row.weightedAmount) },
    ],
    rows: [...report.stages, { ...report.total, name: 'Итого', probability: null }],
  }),
}
