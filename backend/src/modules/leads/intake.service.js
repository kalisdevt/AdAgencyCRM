import { withTransaction } from '../../db/pool.js'
import { normalizeEmail, normalizePhone } from './contacts.js'

const UNIQUE_VIOLATION = '23505'
const DEAL_TITLES = { telegram: 'Обращение из Telegram', web: 'Заявка с сайта', vk: 'Обращение из ВКонтакте' }

// Единая точка приема обращения из любого канала (FR-LEAD-01, 04; диаграмма uml-sequence-lead):
// проверка дубликата → поиск или создание клиента → открытая сделка или новый лид → сохранение сообщения.
export async function handleIncoming(pool, event) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTransaction(pool, (db) => processEvent(db, event))
    } catch (error) {
      // Гонка двух одновременных доставок: на повторе дубликат или созданный клиент уже будут видны
      if (error.code === UNIQUE_VIOLATION && attempt < 3) continue
      throw error
    }
  }
}

async function processEvent(db, event) {
  if (event.externalMessageId) {
    const { rows } = await db.query(
      'SELECT id, deal_id, client_id FROM messages WHERE channel = $1 AND external_id = $2',
      [event.channel, event.externalMessageId],
    )
    if (rows[0]) {
      return { duplicate: true, messageId: rows[0].id, dealId: rows[0].deal_id, clientId: rows[0].client_id }
    }
  }

  const { clientId, clientCreated } = await findOrCreateClient(db, event)
  const { dealId, dealCreated } = await findOrCreateDeal(db, clientId, event)

  const { rows } = await db.query(
    `INSERT INTO messages (deal_id, client_id, channel, direction, external_id, body, created_at)
     VALUES ($1, $2, $3, 'in', $4, $5, $6) RETURNING id`,
    [dealId, clientId, event.channel, event.externalMessageId ?? null, event.text, event.receivedAt ?? new Date()],
  )
  await db.query('UPDATE deals SET updated_at = now() WHERE id = $1', [dealId])

  return { duplicate: false, messageId: rows[0].id, dealId, clientId, clientCreated, dealCreated }
}

async function findOrCreateClient(db, event) {
  const { contact, channel } = event
  const phone = normalizePhone(contact.phone)
  const email = normalizeEmail(contact.email)

  let clientId = null
  let knownContact = false

  if (contact.externalId) {
    const { rows } = await db.query(
      'SELECT client_id FROM client_contacts WHERE channel = $1 AND external_id = $2',
      [channel, contact.externalId],
    )
    if (rows[0]) {
      clientId = rows[0].client_id
      knownContact = true
    }
  }
  if (!clientId && phone) {
    const { rows } = await db.query('SELECT id FROM clients WHERE phone = $1 ORDER BY id LIMIT 1', [phone])
    clientId = rows[0]?.id ?? null
  }
  if (!clientId && email) {
    const { rows } = await db.query('SELECT id FROM clients WHERE lower(email) = $1 ORDER BY id LIMIT 1', [email])
    clientId = rows[0]?.id ?? null
  }

  const clientCreated = !clientId
  if (clientCreated) {
    const { rows } = await db.query(
      'INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3) RETURNING id',
      [contact.name, phone, email],
    )
    clientId = rows[0].id
  } else {
    // Блокируем карточку: параллельные сообщения одного клиента не создадут две сделки.
    // Заодно дополняем пустые контакты, но не затираем уже введенные менеджером.
    await db.query(
      `UPDATE clients SET phone = COALESCE(phone, $2), email = COALESCE(email, $3) WHERE id = $1`,
      [clientId, phone, email],
    )
  }

  if (contact.externalId && !knownContact) {
    await db.query(
      `INSERT INTO client_contacts (client_id, channel, external_id, username, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [clientId, channel, contact.externalId, contact.username ?? null, contact.name],
    )
  }
  return { clientId, clientCreated }
}

async function findOrCreateDeal(db, clientId, event) {
  // Пока сделка не закрыта, новые сообщения клиента продолжают ту же переписку
  const open = await db.query(
    `SELECT id FROM deals
      WHERE client_id = $1 AND stage NOT IN ('paid', 'refused')
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [clientId],
  )
  if (open.rows[0]) return { dealId: open.rows[0].id, dealCreated: false }

  const utm = event.utm ?? {}
  const { rows } = await db.query(
    `INSERT INTO deals (client_id, title, source_channel, campaign_id, utm_source, utm_medium, utm_campaign)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      clientId,
      DEAL_TITLES[event.channel] ?? 'Новое обращение',
      event.channel,
      await campaignIdByCode(db, utm.campaign),
      utm.source ?? null,
      utm.medium ?? null,
      utm.campaign ?? null,
    ],
  )
  return { dealId: rows[0].id, dealCreated: true }
}

// Кампания из UTM-метки заводится в справочнике автоматически (FR-DEAL-02)
async function campaignIdByCode(db, code) {
  if (!code) return null
  const { rows } = await db.query(
    `INSERT INTO campaigns (code, name) VALUES ($1, $1)
     ON CONFLICT (lower(code)) DO UPDATE SET code = campaigns.code
     RETURNING id`,
    [code],
  )
  return rows[0].id
}
