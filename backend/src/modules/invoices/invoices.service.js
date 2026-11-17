import { config } from '../../config.js'
import { withTransaction } from '../../db/pool.js'
import { badRequest, conflict, HttpError, notFound } from '../../errors.js'
import { listContacts } from '../deals/deals.repository.js'
import { insertFile } from '../files/files.service.js'
import { ensureProject } from '../projects/projects.service.js'
import { renderInvoicePdf } from './invoice.pdf.js'

// Стадии, из которых выставление счета переводит сделку в «Счет выставлен»
const BEFORE_INVOICE = ['new', 'qualification', 'proposal_prep', 'proposal_sent']

const INVOICE_SELECT = `
  SELECT i.id, i.deal_id, i.number, i.amount, i.status, i.description, i.file_id,
         i.issued_at, i.paid_at, i.sent_at, i.created_by, u.full_name AS created_by_name,
         d.title AS deal_title, d.client_id, c.name AS client_name,
         p.id AS project_id
    FROM invoices i
    JOIN deals d ON d.id = i.deal_id
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = i.created_by
    LEFT JOIN projects p ON p.deal_id = i.deal_id`

export const INVOICE_STATUSES = [
  { code: 'pending', name: 'Ожидает оплаты' },
  { code: 'paid', name: 'Оплачен' },
]

export function toInvoice(row) {
  return {
    id: row.id,
    number: row.number,
    amount: row.amount,
    status: row.status,
    description: row.description,
    fileId: row.file_id,
    issuedAt: row.issued_at,
    paidAt: row.paid_at,
    sentAt: row.sent_at,
    createdBy: row.created_by ? { id: row.created_by, fullName: row.created_by_name } : null,
    deal: { id: row.deal_id, title: row.deal_title },
    client: { id: row.client_id, name: row.client_name },
    projectId: row.project_id,
  }
}

export async function findInvoice(db, id) {
  const { rows } = await db.query(`${INVOICE_SELECT} WHERE i.id = $1`, [id])
  return rows[0] ? toInvoice(rows[0]) : null
}

export async function listInvoices(db, { dealId, clientId } = {}) {
  const column = dealId ? 'i.deal_id' : 'd.client_id'
  const { rows } = await db.query(`${INVOICE_SELECT} WHERE ${column} = $1 ORDER BY i.issued_at DESC, i.id DESC`, [dealId ?? clientId])
  return rows.map(toInvoice)
}

// Формирование счета в PDF (FR-DOC-01): реквизиты агентства и клиента, сумма из сделки
export async function createInvoice(pool, storage, { dealId, description }, user) {
  return withTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT d.id, d.title, d.stage, d.amount, c.name, c.company, c.inn, c.address, c.phone, c.email
         FROM deals d JOIN clients c ON c.id = d.client_id
        WHERE d.id = $1 FOR UPDATE OF d`,
      [dealId],
    )
    const deal = rows[0]
    if (!deal) throw notFound('Сделка не найдена')
    if (deal.stage === 'refused') throw badRequest('Сделка в «Отказе»: счет выставить нельзя')
    if (deal.stage === 'paid') throw badRequest('Сделка уже оплачена')
    if (!(deal.amount > 0)) throw badRequest('Укажите сумму сделки — она переносится в счет')

    const sequence = await db.query(`SELECT nextval('invoice_number_seq') AS n, now() AS issued_at`)
    const issuedAt = sequence.rows[0].issued_at
    const number = `СЧ-${issuedAt.getFullYear()}-${String(sequence.rows[0].n).padStart(4, '0')}`
    const text = description?.trim() || `Рекламные услуги: ${deal.title}`

    const pdf = await renderInvoicePdf({
      invoice: { number, issuedAt, amount: deal.amount, description: text, dealId },
      agency: config.agency,
      client: deal,
    })
    const { row: file } = await insertFile(db, storage, {
      content: pdf,
      name: `Счет ${number}.pdf`,
      mimeType: 'application/pdf',
      uploadedBy: user,
      dealId,
    })
    const inserted = await db.query(
      `INSERT INTO invoices (deal_id, number, amount, status, file_id, issued_at, description, created_by)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7) RETURNING id`,
      [dealId, number, deal.amount, file.id, issuedAt, text, user.id],
    )
    if (BEFORE_INVOICE.includes(deal.stage)) {
      await db.query(`UPDATE deals SET stage = 'invoiced', updated_at = now() WHERE id = $1`, [dealId])
    }
    return findInvoice(db, inserted.rows[0].id)
  })
}

// Ручная отметка оплаты (FR-DOC-02): сделка переходит в «Оплачено», создается проект (FR-PROJ-01)
export async function setInvoiceStatus(pool, id, status, user) {
  return withTransaction(pool, async (db) => {
    const { rows } = await db.query('SELECT id, deal_id, status FROM invoices WHERE id = $1 FOR UPDATE', [id])
    const invoice = rows[0]
    if (!invoice) throw notFound('Счет не найден')
    if (invoice.status === status) return { invoice: await findInvoice(db, id), projectCreated: false }
    if (invoice.status === 'paid') {
      throw conflict('Оплата уже отмечена, по сделке создан проект: вернуть счет в «Ожидает оплаты» нельзя')
    }

    await db.query(`UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1`, [id])
    await db.query(
      `UPDATE deals
          SET stage = 'paid', closed_at = now(), refusal_reason_id = NULL, refusal_comment = NULL, updated_at = now()
        WHERE id = $1`,
      [invoice.deal_id],
    )
    const project = await ensureProject(db, invoice.deal_id, user)
    return { invoice: await findInvoice(db, id), projectCreated: project.created }
  })
}

// Отправка PDF счета клиенту в Telegram (FR-DOC-03, желательное)
export async function sendInvoiceToClient(pool, channels, storage, id, user) {
  const invoice = await findInvoice(pool, id)
  if (!invoice) throw notFound('Счет не найден')
  const adapter = channels.get('telegram')
  if (!adapter?.isConfigured) throw new HttpError(422, 'channel_unavailable', 'Telegram-бот не подключен на сервере')
  const contact = (await listContacts(pool, invoice.client.id)).find((item) => item.channel === 'telegram')
  if (!contact) throw new HttpError(422, 'no_contact', 'Клиент не писал боту в Telegram — отправьте счет другим способом')

  const { rows } = await pool.query('SELECT stored_path FROM files WHERE id = $1', [invoice.fileId])
  const content = await storage.read(rows[0].stored_path)
  const caption = `Счет № ${invoice.number} на сумму ${new Intl.NumberFormat('ru-RU').format(invoice.amount)} ₽`
  const sent = await adapter.sendDocument(contact, {
    content,
    fileName: `Счет ${invoice.number}.pdf`,
    mimeType: 'application/pdf',
    caption,
  })

  await withTransaction(pool, async (db) => {
    await db.query(`UPDATE invoices SET sent_at = now() WHERE id = $1`, [id])
    // В истории переписки видно, что счет отправлен
    await db.query(
      `INSERT INTO messages (deal_id, client_id, channel, direction, external_id, body, author_id, is_read)
       VALUES ($1, $2, 'telegram', 'out', $3, $4, $5, true)`,
      [invoice.deal.id, invoice.client.id, sent?.externalMessageId ?? null, `📄 ${caption}`, user.id],
    )
  })
  return findInvoice(pool, id)
}
