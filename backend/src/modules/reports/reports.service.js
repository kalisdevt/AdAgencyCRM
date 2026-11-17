import { ASSIGNABLE_ROLES } from '../../roles.js'
import { STAGES } from '../deals/stages.js'

// Отчеты считаются по датам в часовом поясе агентства, а не сервера
export const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || 'Europe/Moscow'

const ratio = (part, whole) => (whole > 0 ? part / whole : null)
const perUnit = (expenses, count) => (expenses > 0 && count > 0 ? expenses / count : null)

// Вероятность оплаты открытой сделки по стадии — для оценки ожидаемой выручки с учетом риска
export const STAGE_PROBABILITY = { new: 0.1, qualification: 0.2, proposal_prep: 0.35, proposal_sent: 0.5, invoiced: 0.9 }

// Лиды периода — сделки, созданные в период; успешные — из них оплаченные (когортный подход:
// конверсия показывает, какая доля обращений периода превратилась в оплату)
const PERIOD_DEALS = `(d.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2`

function totals(rows, expenses = 0) {
  const leads = rows.reduce((sum, row) => sum + row.leads, 0)
  const won = rows.reduce((sum, row) => sum + row.won, 0)
  return {
    leads,
    won,
    refused: rows.reduce((sum, row) => sum + row.refused, 0),
    conversion: ratio(won, leads),
    wonAmount: rows.reduce((sum, row) => sum + row.wonAmount, 0),
    expenses,
    costPerLead: perUnit(expenses, leads),
    costPerClient: perUnit(expenses, won),
  }
}

// Отчет по каналам и кампаниям за период (FR-AN-01) с расходами и стоимостью привлечения (FR-AN-02)
export async function channelsReport(db, { from, to }) {
  const params = [from, to, REPORT_TIMEZONE]
  const [channels, campaigns] = await Promise.all([
    db.query(
      `SELECT d.source_channel AS channel,
              count(*)::int AS leads,
              count(*) FILTER (WHERE d.stage = 'paid')::int AS won,
              count(*) FILTER (WHERE d.stage = 'refused')::int AS refused,
              COALESCE(sum(d.amount) FILTER (WHERE d.stage = 'paid'), 0) AS won_amount
         FROM deals d
        WHERE ${PERIOD_DEALS}
        GROUP BY d.source_channel
        ORDER BY leads DESC, channel`,
      params,
    ),
    db.query(
      `WITH stats AS (
         SELECT d.campaign_id,
                count(*)::int AS leads,
                count(*) FILTER (WHERE d.stage = 'paid')::int AS won,
                count(*) FILTER (WHERE d.stage = 'refused')::int AS refused,
                COALESCE(sum(d.amount) FILTER (WHERE d.stage = 'paid'), 0) AS won_amount
           FROM deals d
          WHERE ${PERIOD_DEALS}
          GROUP BY d.campaign_id
       ), spent AS (
         SELECT campaign_id, sum(amount) AS expenses
           FROM campaign_expenses
          WHERE spent_on BETWEEN $1 AND $2
          GROUP BY campaign_id
       )
       SELECT c.id, c.code, c.name,
              COALESCE(s.leads, 0) AS leads, COALESCE(s.won, 0) AS won, COALESCE(s.refused, 0) AS refused,
              COALESCE(s.won_amount, 0) AS won_amount, COALESCE(e.expenses, 0) AS expenses
         FROM campaigns c
         LEFT JOIN stats s ON s.campaign_id = c.id
         LEFT JOIN spent e ON e.campaign_id = c.id
        WHERE s.leads > 0 OR e.expenses > 0
       UNION ALL
       SELECT NULL, NULL, 'Без кампании', s.leads, s.won, s.refused, s.won_amount, 0
         FROM stats s WHERE s.campaign_id IS NULL
       ORDER BY leads DESC, name`,
      params,
    ),
  ])

  const channelRows = channels.rows.map((row) => ({
    channel: row.channel,
    leads: row.leads,
    won: row.won,
    refused: row.refused,
    conversion: ratio(row.won, row.leads),
    wonAmount: row.won_amount,
  }))
  const campaignRows = campaigns.rows.map((row) => ({
    campaignId: row.id,
    code: row.code,
    name: row.name,
    leads: row.leads,
    won: row.won,
    refused: row.refused,
    conversion: ratio(row.won, row.leads),
    wonAmount: row.won_amount,
    expenses: row.expenses,
    costPerLead: perUnit(row.expenses, row.leads),
    costPerClient: perUnit(row.expenses, row.won),
  }))
  const expenses = campaignRows.reduce((sum, row) => sum + row.expenses, 0)
  return { channels: channelRows, campaigns: campaignRows, total: totals(channelRows, expenses) }
}

// Отчет по причинам отказа за период (FR-AN-03): по дате перевода сделки в «Отказ»
export async function refusalsReport(db, { from, to }) {
  const params = [from, to, REPORT_TIMEZONE]
  const where = `d.stage = 'refused' AND (d.closed_at AT TIME ZONE $3)::date BETWEEN $1 AND $2`
  const [reasons, deals] = await Promise.all([
    db.query(
      `SELECT rr.id, rr.name, count(*)::int AS count, COALESCE(sum(d.amount), 0) AS amount
         FROM deals d JOIN refusal_reasons rr ON rr.id = d.refusal_reason_id
        WHERE ${where}
        GROUP BY rr.id, rr.name
        ORDER BY count DESC, rr.name`,
      params,
    ),
    db.query(
      `SELECT d.id, d.title, d.amount, d.closed_at, d.source_channel, d.refusal_comment,
              rr.name AS reason, c.name AS client_name, u.full_name AS assignee_name
         FROM deals d
         JOIN refusal_reasons rr ON rr.id = d.refusal_reason_id
         JOIN clients c ON c.id = d.client_id
         LEFT JOIN users u ON u.id = d.assignee_id
        WHERE ${where}
        ORDER BY d.closed_at DESC
        LIMIT 500`,
      params,
    ),
  ])
  const total = reasons.rows.reduce((sum, row) => sum + row.count, 0)
  return {
    reasons: reasons.rows.map((row) => ({ id: row.id, name: row.name, count: row.count, share: ratio(row.count, total), amount: row.amount })),
    deals: deals.rows.map((row) => ({
      id: row.id,
      title: row.title,
      amount: row.amount,
      closedAt: row.closed_at,
      channel: row.source_channel,
      reason: row.reason,
      comment: row.refusal_comment,
      client: row.client_name,
      assignee: row.assignee_name,
    })),
    total,
  }
}

// KPI менеджеров за период (FR-AN-04): обработанные лиды, конверсия, сумма сделок, время первого ответа
export async function managersReport(db, { from, to }) {
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.is_active, r.name AS role_name,
            count(d.id)::int AS leads,
            count(d.id) FILTER (WHERE d.first_response_at IS NOT NULL OR d.stage <> 'new')::int AS processed,
            count(d.id) FILTER (WHERE d.stage = 'paid')::int AS won,
            count(d.id) FILTER (WHERE d.stage = 'refused')::int AS refused,
            COALESCE(sum(d.amount) FILTER (WHERE d.stage = 'paid'), 0) AS won_amount,
            avg(extract(epoch FROM d.first_response_at - d.created_at))
              FILTER (WHERE d.first_response_at IS NOT NULL) AS avg_response_seconds
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN deals d ON d.assignee_id = u.id AND ${PERIOD_DEALS}
      WHERE r.code = ANY($4)
      GROUP BY u.id, u.full_name, u.is_active, r.name
     HAVING u.is_active OR count(d.id) > 0
      ORDER BY won_amount DESC, leads DESC, u.full_name`,
    [from, to, REPORT_TIMEZONE, ASSIGNABLE_ROLES],
  )
  const unassigned = await db.query(
    `SELECT count(*)::int AS n FROM deals d WHERE ${PERIOD_DEALS} AND d.assignee_id IS NULL`,
    [from, to, REPORT_TIMEZONE],
  )
  return {
    managers: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      roleName: row.role_name,
      isActive: row.is_active,
      leads: row.leads,
      processed: row.processed,
      won: row.won,
      refused: row.refused,
      conversion: ratio(row.won, row.leads),
      wonAmount: row.won_amount,
      avgResponseMinutes: row.avg_response_seconds === null ? null : Math.round(Number(row.avg_response_seconds) / 60),
    })),
    unassignedLeads: unassigned.rows[0].n,
  }
}

// Ожидаемая выручка по открытым сделкам в разрезе стадий (FR-AN-05). Не зависит от периода.
export async function revenueReport(db) {
  const { rows } = await db.query(
    `SELECT stage, count(*)::int AS count, COALESCE(sum(amount), 0) AS amount
       FROM deals WHERE stage NOT IN ('paid', 'refused')
      GROUP BY stage`,
  )
  const byStage = new Map(rows.map((row) => [row.stage, row]))
  const stages = STAGES.filter((stage) => STAGE_PROBABILITY[stage.code] !== undefined).map((stage) => {
    const row = byStage.get(stage.code)
    const amount = row?.amount ?? 0
    return {
      code: stage.code,
      name: stage.name,
      count: row?.count ?? 0,
      amount,
      probability: STAGE_PROBABILITY[stage.code],
      weightedAmount: Math.round(amount * STAGE_PROBABILITY[stage.code] * 100) / 100,
    }
  })
  return {
    stages,
    total: {
      count: stages.reduce((sum, stage) => sum + stage.count, 0),
      amount: stages.reduce((sum, stage) => sum + stage.amount, 0),
      weightedAmount: Math.round(stages.reduce((sum, stage) => sum + stage.weightedAmount, 0) * 100) / 100,
    },
  }
}
