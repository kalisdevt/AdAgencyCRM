const DEAL_SELECT = `
  SELECT d.id, d.title, d.stage, d.amount, d.source_channel, d.utm_source, d.utm_medium, d.utm_campaign,
         d.refusal_reason_id, rr.name AS refusal_reason, d.refusal_comment,
         d.first_response_at, d.closed_at, d.created_at, d.updated_at,
         d.client_id, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
         d.assignee_id, u.full_name AS assignee_name,
         cmp.name AS campaign_name,
         (SELECT count(*) FROM deals other WHERE other.client_id = d.client_id AND other.id <> d.id) > 0 AS is_returning,
         lm.body AS last_message, lm.direction AS last_direction, lm.created_at AS last_message_at,
         COALESCE(um.unread, 0) AS unread
    FROM deals d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = d.assignee_id
    LEFT JOIN refusal_reasons rr ON rr.id = d.refusal_reason_id
    LEFT JOIN campaigns cmp ON cmp.id = d.campaign_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.direction, m.created_at FROM messages m
       WHERE m.deal_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS unread FROM messages m
       WHERE m.deal_id = d.id AND m.direction = 'in' AND NOT m.is_read
    ) um ON true`

export function toDeal(row) {
  return {
    id: row.id,
    title: row.title,
    stage: row.stage,
    amount: row.amount,
    channel: row.source_channel,
    utm: { source: row.utm_source, medium: row.utm_medium, campaign: row.utm_campaign },
    campaign: row.campaign_name,
    refusalReasonId: row.refusal_reason_id,
    refusalReason: row.refusal_reason,
    refusalComment: row.refusal_comment,
    firstResponseAt: row.first_response_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: {
      id: row.client_id,
      name: row.client_name,
      phone: row.client_phone,
      email: row.client_email,
      isReturning: row.is_returning,
    },
    assignee: row.assignee_id ? { id: row.assignee_id, fullName: row.assignee_name } : null,
    lastMessage: row.last_message_at
      ? { text: row.last_message, direction: row.last_direction, createdAt: row.last_message_at }
      : null,
    unread: row.unread,
  }
}

export function toMessage(row) {
  return {
    id: row.id,
    dealId: row.deal_id,
    channel: row.channel,
    direction: row.direction,
    text: row.body,
    author: row.author_id ? { id: row.author_id, fullName: row.author_name } : null,
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

// Лента «Входящие» (FR-LEAD-03): сделки с последним сообщением и числом непрочитанных
export async function listInbox(db, { channel, stage, assigneeId, unassigned, unreadOnly } = {}) {
  const where = []
  const params = []
  const add = (sql, value) => {
    params.push(value)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (channel) add('d.source_channel = ?', channel)
  if (stage) add('d.stage = ?', stage)
  if (assigneeId) add('d.assignee_id = ?', assigneeId)
  if (unassigned) where.push('d.assignee_id IS NULL')
  if (unreadOnly) where.push('COALESCE(um.unread, 0) > 0')

  const { rows } = await db.query(
    `${DEAL_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(lm.created_at, d.created_at) DESC, d.id DESC
     LIMIT 200`,
    params,
  )
  return rows.map(toDeal)
}

export async function countUnreadDeals(db) {
  const { rows } = await db.query(
    `SELECT count(DISTINCT deal_id)::int AS total FROM messages WHERE direction = 'in' AND NOT is_read`,
  )
  return rows[0].total
}

export async function findDeal(db, id) {
  const { rows } = await db.query(`${DEAL_SELECT} WHERE d.id = $1`, [id])
  return rows[0] ? toDeal(rows[0]) : null
}

export async function listDealsByClient(db, clientId) {
  const { rows } = await db.query(`${DEAL_SELECT} WHERE d.client_id = $1 ORDER BY d.created_at DESC`, [clientId])
  return rows.map(toDeal)
}

const MESSAGE_SELECT = `
  SELECT m.id, m.deal_id, m.channel, m.direction, m.body, m.is_read, m.created_at,
         m.author_id, u.full_name AS author_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.author_id`

export async function listMessages(db, { dealId, clientId }) {
  const column = dealId ? 'm.deal_id' : 'm.client_id'
  const { rows } = await db.query(
    `SELECT * FROM (${MESSAGE_SELECT} WHERE ${column} = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 500) recent
      ORDER BY created_at, id`,
    [dealId ?? clientId],
  )
  return rows.map(toMessage)
}

export async function listContacts(db, clientId) {
  const { rows } = await db.query(
    `SELECT channel, external_id, username, display_name FROM client_contacts WHERE client_id = $1 ORDER BY id`,
    [clientId],
  )
  return rows.map((row) => ({
    channel: row.channel,
    externalId: row.external_id,
    username: row.username,
    displayName: row.display_name,
  }))
}
