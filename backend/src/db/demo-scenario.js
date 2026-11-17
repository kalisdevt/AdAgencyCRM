// Демонстрационный сценарий (ТЗ п. 7): сделки на всех стадиях, задачи с макетом, счета, проекты,
// отказы, расходы на кампании и учетная запись клиента. Данные создаются через те же сервисы,
// что и в рабочем интерфейсе, поэтому они согласованы между собой. Реальные данные не используются.
import zlib from 'node:zlib'
import { withTransaction } from './pool.js'
import { updateDeal } from '../modules/deals/deals.service.js'
import { createInvoice, setInvoiceStatus } from '../modules/invoices/invoices.service.js'
import { handleIncoming } from '../modules/leads/intake.service.js'
import { setStage } from '../modules/projects/projects.service.js'
import { addComment, addTaskFile, createTask, updateTask } from '../modules/tasks/tasks.service.js'
import { createUser } from '../modules/users/users.service.js'

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000)

// Дополнительные обращения к базовым из seed.js
const EXTRA_EVENTS = [
  {
    channel: 'web',
    externalMessageId: 'demo-web-0003',
    contact: { name: 'Студия йоги «Прана»', phone: '+7 900 555-01-01', email: 'prana@example.test' },
    text: 'Сколько стоит листовка А5 тиражом 1000?',
    utm: { source: 'yandex', medium: 'cpc', campaign: 'autumn-2026' },
    receivedAt: minutesAgo(300),
  },
  {
    channel: 'telegram',
    externalMessageId: 'demo:4',
    contact: { externalId: 'demo-1003', username: 'motor_demo', name: 'Автосервис «Мотор»' },
    text: 'Нужен баннер на фасад к выходным.',
    receivedAt: minutesAgo(240),
  },
  {
    channel: 'web',
    externalMessageId: 'demo-web-0004',
    contact: { name: 'Пекарня «Колос»', phone: '+7 900 555-02-02' },
    text: 'Хотим меню-борд и наклейки на витрину.',
    receivedAt: minutesAgo(180),
  },
  {
    channel: 'web',
    externalMessageId: 'demo-web-0005',
    contact: { name: 'Магазин «Уют»', email: 'uyut@example.test' },
    text: 'Интересует печать каталога, 40 страниц.',
    utm: { source: 'vk', medium: 'social', campaign: 'expo' },
    receivedAt: minutesAgo(3),
  },
]

// Повторное обращение клиента, у которого уже есть завершенный проект
const RETURNING_EVENT = {
  channel: 'web',
  externalMessageId: 'demo-web-0006',
  contact: { name: 'Ирина Волкова', phone: '+7 912 000-11-22', email: 'irina@example.test' },
  text: 'Нужен новогодний баннер на тот же щит.',
  utm: { source: 'yandex', medium: 'cpc', campaign: 'autumn-2026' },
  receivedAt: minutesAgo(30),
}

// Простой «макет» 600×300 для демонстрации загрузки файла дизайнером
function demoMockupPng() {
  const width = 600
  const height = 300
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      const inSign = x > 60 && x < 540 && y > 90 && y < 210
      const color = inSign ? [215, 247, 130] : [32, 42, 36]
      row.set(color, 1 + x * 3)
    }
    rows.push(row)
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function loadUsers(pool) {
  const { rows } = await pool.query(
    `SELECT u.id, u.login, u.full_name AS "fullName", r.code AS role FROM users u JOIN roles r ON r.id = u.role_id`,
  )
  return Object.fromEntries(rows.map((user) => [user.login, user]))
}

async function dealOf(pool, externalMessageId) {
  const { rows } = await pool.query('SELECT deal_id FROM messages WHERE external_id = $1', [externalMessageId])
  return rows[0]?.deal_id
}

// Ответ менеджера в истории переписки: в демонстрации без Telegram-бота сообщение во внешний канал не уходит
async function demoReply(pool, dealId, author, text, minutesAfterStart) {
  await withTransaction(pool, async (db) => {
    const { rows } = await db.query('SELECT client_id, source_channel, created_at FROM deals WHERE id = $1', [dealId])
    const deal = rows[0]
    if (!['telegram', 'vk'].includes(deal.source_channel)) {
      await db.query(
        `UPDATE deals SET first_response_at = COALESCE(first_response_at, created_at + $2 * interval '1 minute') WHERE id = $1`,
        [dealId, minutesAfterStart],
      )
      return
    }
    await db.query(
      `INSERT INTO messages (deal_id, client_id, channel, direction, body, author_id, is_read, created_at)
       VALUES ($1, $2, $3, 'out', $4, $5, true, $6)`,
      [dealId, deal.client_id, deal.source_channel, text, author.id, new Date(deal.created_at.getTime() + minutesAfterStart * 60_000)],
    )
    await db.query(
      `UPDATE deals SET first_response_at = COALESCE(first_response_at, created_at + $2 * interval '1 minute') WHERE id = $1`,
      [dealId, minutesAfterStart],
    )
    await db.query(`UPDATE messages SET is_read = true WHERE deal_id = $1 AND direction = 'in'`, [dealId])
  })
}

async function payAndStartProject(pool, storage, dealId, manager, stagesDone) {
  const invoice = await createInvoice(pool, storage, { dealId }, manager)
  const { invoice: paid } = await setInvoiceStatus(pool, invoice.id, 'paid', manager)
  for (const code of stagesDone) await setStage(pool, paid.projectId, code, true, manager)
  return paid.projectId
}

// Возвращает false, если сценарий уже применялся (база не пустая)
export async function seedScenario(pool, storage, { clientPassword }) {
  const { rows } = await pool.query('SELECT (SELECT count(*) FROM projects) + (SELECT count(*) FROM tasks) AS n')
  if (Number(rows[0].n) > 0) return false

  for (const event of EXTRA_EVENTS) await handleIncoming(pool, event)
  const users = await loadUsers(pool)
  const { manager, manager2, head, designer, marketer } = users
  const deal = async (id) => dealOf(pool, id)

  // Ирина Волкова: завершенный проект (архив), затем повторное обращение с проектом в работе
  const irina = await deal('demo-web-0001')
  await updateDeal(pool, irina, { title: 'Наружная реклама: три щита в центре', assigneeId: manager.id, amount: 45000, stage: 'qualification' })
  await demoReply(pool, irina, manager, 'Здравствуйте, Ирина! Подготовим расчет сегодня.', 12)
  await payAndStartProject(pool, storage, irina, manager, ['design', 'approval', 'printing', 'placement', 'completed'])

  await handleIncoming(pool, RETURNING_EVENT)
  const irinaNew = await deal('demo-web-0006')
  await updateDeal(pool, irinaNew, { title: 'Новогодний баннер на щит', assigneeId: manager.id, amount: 18000 })
  await demoReply(pool, irinaNew, manager, 'Ирина, рады снова работать с вами!', 5)
  await payAndStartProject(pool, storage, irinaNew, manager, ['design', 'approval'])

  const { rows: irinaClient } = await pool.query('SELECT client_id FROM deals WHERE id = $1', [irina])
  await pool.query(`UPDATE clients SET company = 'ИП Волкова И. А.', inn = '123456789012', address = 'г. Тестовск, ул. Садовая, 5' WHERE id = $1`, [irinaClient[0].client_id])
  await createUser(pool, { login: 'client', email: 'client@example.test', fullName: 'Ирина Волкова', password: clientPassword, role: 'client', clientId: irinaClient[0].client_id })

  // Петр Соколов: подготовка КП, задача дизайнеру в работе
  const petr = await deal('demo:1')
  await updateDeal(pool, petr, { title: 'Баннер 3×6 м к открытию магазина', assigneeId: manager.id, amount: 12000, stage: 'proposal_prep' })
  await demoReply(pool, petr, manager, 'Петр, добрый день! Успеем: печать занимает 3 дня. Пришлите, пожалуйста, логотип.', 8)
  const petrTask = await createTask(pool, {
    dealId: petr,
    title: 'Макет баннера 3×6 для КП',
    description: 'Баннер 3×6 м, логотип клиента, крупно: «Открытие 1 декабря». Цвета — фирменные.',
    assigneeId: designer.id,
    dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
  }, manager)
  await updateTask(pool, petrTask.id, { status: 'in_progress' }, designer)
  await addComment(pool, petrTask.id, 'Логотип в векторе есть? Если нет — отрисую сам.', designer)

  // ООО «Вектор»: КП отправлено, макет загружен и ждет согласования
  const vector = await deal('demo-web-0002')
  await updateDeal(pool, vector, { title: 'Визитки и буклеты для выставки', assigneeId: manager2.id, amount: 9500, stage: 'proposal_sent' })
  await demoReply(pool, vector, manager2, '', 25)
  const vectorTask = await createTask(pool, { dealId: vector, title: 'Макет буклета для выставки', assigneeId: designer.id, description: 'Буклет А4, евро-фальц, тексты от клиента.' }, manager2)
  await addTaskFile(pool, storage, vectorTask.id, { content: demoMockupPng(), name: 'Буклет Вектор v1.png' }, designer)
  await updateTask(pool, vectorTask.id, { status: 'review' }, designer)

  // Кофейня «Зерно»: счет выставлен и ждет оплаты
  const zerno = await deal('demo:3')
  await updateDeal(pool, zerno, { title: 'Световая вывеска', assigneeId: manager2.id, amount: 32000 })
  await demoReply(pool, zerno, manager2, 'Добрый день! Примеры работ отправили, счет подготовим сегодня.', 4)
  await createInvoice(pool, storage, { dealId: zerno }, manager2)

  // Отказы с причинами (FR-DEAL-03)
  const reasons = Object.fromEntries((await pool.query('SELECT id, name FROM refusal_reasons')).rows.map((row) => [row.name, row.id]))
  const prana = await deal('demo-web-0003')
  await updateDeal(pool, prana, { title: 'Листовки А5, 1000 шт.', assigneeId: manager.id, amount: 6000 })
  await demoReply(pool, prana, manager, '', 40)
  await updateDeal(pool, prana, { stage: 'refused', refusalReasonId: reasons['Дорого'], refusalComment: 'Нашли типографию дешевле' })
  const motor = await deal('demo:4')
  await updateDeal(pool, motor, { title: 'Баннер на фасад', assigneeId: manager2.id, amount: 8000 })
  await demoReply(pool, motor, manager2, 'Здравствуйте! К выходным, к сожалению, не успеем — ближайший срок через 5 дней.', 95)
  await updateDeal(pool, motor, { stage: 'refused', refusalReasonId: reasons['Не устроили сроки'] })

  // Пекарня — квалификация у руководителя; «Уют» — новое обращение без ответственного
  const kolos = await deal('demo-web-0004')
  await updateDeal(pool, kolos, { title: 'Меню-борд и наклейки на витрину', assigneeId: head.id, amount: 15000, stage: 'qualification' })

  // Кампании: понятные названия и расходы (FR-AN-02)
  await pool.query(`UPDATE campaigns SET name = 'Осенняя акция (Яндекс Директ)' WHERE code = 'autumn-2026'`)
  await pool.query(`UPDATE campaigns SET name = 'Выставка «Реклама-2026» (ВКонтакте)' WHERE code = 'expo'`)
  await pool.query(
    `INSERT INTO campaign_expenses (campaign_id, spent_on, amount, comment, created_by)
     SELECT id, current_date, amount, comment, $1
       FROM campaigns c JOIN (VALUES ('autumn-2026', 15000, 'Яндекс Директ'), ('expo', 8000, 'Таргет ВКонтакте')) AS e(code, amount, comment)
         ON e.code = c.code`,
    [marketer.id],
  )
  return true
}
