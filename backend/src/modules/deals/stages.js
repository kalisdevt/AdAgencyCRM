// Стадии воронки продаж (FR-DEAL-01) в порядке прохождения
export const STAGES = [
  { code: 'new', name: 'Новый' },
  { code: 'qualification', name: 'Квалификация' },
  { code: 'proposal_prep', name: 'Подготовка КП' },
  { code: 'proposal_sent', name: 'КП отправлено' },
  { code: 'invoiced', name: 'Счет выставлен' },
  { code: 'paid', name: 'Оплачено' },
  { code: 'refused', name: 'Отказ' },
]

export const STAGE_CODES = STAGES.map((stage) => stage.code)
export const CLOSED_STAGES = ['paid', 'refused']
