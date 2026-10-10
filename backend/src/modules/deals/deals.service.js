import { withTransaction } from '../../db/pool.js'
import { badRequest, HttpError, notFound } from '../../errors.js'
import { CLOSED_STAGES } from './stages.js'
import { findDeal, listContacts, toMessage } from './deals.repository.js'

const ASSIGNABLE_ROLES = ['manager', 'sales_head']

async function requireDeal(db, id) {
  const deal = await findDeal(db, id)
  if (!deal) throw notFound('Сделка не найдена')
  return deal
}

// Почему из системы нельзя ответить клиенту (null — можно)
export function replyBlocker(deal, contacts, channels) {
  const adapter = channels.get(deal.channel)
  if (!adapter?.canReply) {
    return 'Канал обращения не поддерживает ответ из системы — свяжитесь с клиентом по телефону или почте'
  }
  if (!adapter.isConfigured) return `${adapter.title}: канал не подключен на сервере`
  if (!contacts.some((contact) => contact.channel === deal.channel)) return 'У клиента нет контакта в этом канале'
  return null
}

// Смена стадии, ответственного и суммы (FR-DEAL-01, 03; FR-LEAD-07)
export async function updateDeal(pool, id, changes) {
  return withTransaction(pool, async (db) => {
    const locked = await db.query(
      `SELECT stage, refusal_reason_id, refusal_comment, assignee_id, amount, closed_at
         FROM deals WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const current = locked.rows[0]
    if (!current) throw notFound('Сделка не найдена')

    const stage = changes.stage ?? current.stage
    const stageChanged = stage !== current.stage

    // Причина и комментарий существуют только у сделки в «Отказе»
    let refusalReasonId = null
    let refusalComment = null
    if (stage === 'refused') {
      refusalReasonId = changes.refusalReasonId ?? current.refusal_reason_id
      if (!refusalReasonId) throw badRequest('Чтобы перевести сделку в «Отказ», выберите причину отказа')
      if (changes.refusalReasonId) {
        const reason = await db.query('SELECT 1 FROM refusal_reasons WHERE id = $1 AND is_active', [refusalReasonId])
        if (!reason.rowCount) throw badRequest('Причина отказа не найдена в справочнике')
      }
      refusalComment =
        changes.refusalComment !== undefined ? changes.refusalComment?.trim() || null : current.refusal_comment
    }

    if (changes.assigneeId) {
      const assignee = await db.query(
        `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND u.is_active AND r.code = ANY($2)`,
        [changes.assigneeId, ASSIGNABLE_ROLES],
      )
      if (!assignee.rowCount) throw badRequest('Ответственным можно назначить только действующего менеджера')
    }

    let closedAt = current.closed_at
    if (stageChanged) closedAt = CLOSED_STAGES.includes(stage) ? new Date() : null

    await db.query(
      `UPDATE deals
          SET stage = $2, refusal_reason_id = $3, refusal_comment = $4, assignee_id = $5,
              amount = $6, closed_at = $7, updated_at = now()
        WHERE id = $1`,
      [
        id,
        stage,
        refusalReasonId,
        refusalComment,
        changes.assigneeId === undefined ? current.assignee_id : changes.assigneeId,
        changes.amount ?? current.amount,
        closedAt,
      ],
    )
    return findDeal(db, id)
  })
}

export async function markDealRead(db, id) {
  await requireDeal(db, id)
  await db.query(`UPDATE messages SET is_read = true WHERE deal_id = $1 AND direction = 'in' AND NOT is_read`, [id])
}

// Ответ клиенту в тот канал, из которого пришло обращение (FR-LEAD-06).
// Сначала отправляем во внешний канал: в историю попадает только реально доставленное.
export async function replyToClient(pool, channels, { dealId, text, author }) {
  const deal = await requireDeal(pool, dealId)
  const contacts = await listContacts(pool, deal.client.id)
  const blocker = replyBlocker(deal, contacts, channels)
  if (blocker) throw new HttpError(422, 'reply_unavailable', blocker)

  const adapter = channels.get(deal.channel)
  const contact = contacts.find((item) => item.channel === deal.channel)
  const sent = await adapter.sendMessage(contact, text)

  return withTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO messages (deal_id, client_id, channel, direction, external_id, body, author_id, is_read)
       VALUES ($1, $2, $3, 'out', $4, $5, $6, true)
       RETURNING id, deal_id, channel, direction, body, is_read, created_at, author_id`,
      [dealId, deal.client.id, deal.channel, sent?.externalMessageId ?? null, text, author.id],
    )
    // Время первого ответа нужно для KPI менеджеров (FR-AN-04); ответивший становится ответственным, если его не было
    await db.query(
      `UPDATE deals
          SET first_response_at = COALESCE(first_response_at, now()),
              assignee_id = COALESCE(assignee_id, $2),
              updated_at = now()
        WHERE id = $1`,
      [dealId, ASSIGNABLE_ROLES.includes(author.role) ? author.id : null],
    )
    await db.query(`UPDATE messages SET is_read = true WHERE deal_id = $1 AND direction = 'in' AND NOT is_read`, [dealId])
    return toMessage({ ...rows[0], author_name: author.fullName })
  })
}
