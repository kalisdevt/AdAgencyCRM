import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createChannels } from '../src/modules/channels/index.js'
import { amountInWords } from '../src/modules/invoices/amount-in-words.js'
import { startTestApp } from './helpers.js'

const WEBHOOK_SECRET = 'test-webhook-secret'

// Подмена Telegram Bot API: JSON-вызовы и отправка файлов (multipart)
function fakeTelegram() {
  const calls = []
  const fetchImpl = async (url, init) => {
    const method = url.split('/').pop()
    const payload = init.body instanceof FormData
      ? { chat_id: init.body.get('chat_id'), caption: init.body.get('caption'), document: init.body.get('document') }
      : JSON.parse(init.body)
    calls.push({ method, payload })
    return Response.json({ ok: true, result: { message_id: 7000 + calls.length, chat: { id: payload.chat_id } } })
  }
  return { calls, fetchImpl }
}

describe('Сумма прописью', () => {
  it('склоняет рубли, тысячи и копейки', () => {
    assert.equal(amountInWords(12500), 'Двенадцать тысяч пятьсот рублей 00 копеек')
    assert.equal(amountInWords(1001.21), 'Одна тысяча один рубль 21 копейка')
    assert.equal(amountInWords(2_342_000.5), 'Два миллиона триста сорок две тысячи рублей 50 копеек')
    assert.equal(amountInWords(0), 'Ноль рублей 00 копеек')
  })
})

// Сценарий 4 из п. 6.2 ТЗ: менеджер формирует счет в PDF, отмечает оплату;
// сделка переходит в «Оплачено», создается проект (FR-DOC-01, 02, FR-PROJ-01)
describe('Счета и проекты', () => {
  let ctx
  let telegram
  let manager
  let head
  let director
  let designer
  let dealId
  let invoiceId
  let projectId

  const deal = async () => (await ctx.request('GET', `/deals/${dealId}`, { token: manager })).body.deal

  before(async () => {
    telegram = fakeTelegram()
    ctx = await startTestApp({
      channels: createChannels({ telegram: { token: 'test-token', fetchImpl: telegram.fetchImpl } }),
      telegramWebhookSecret: WEBHOOK_SECRET,
    })
    ;[manager, head, director, designer] = await Promise.all(['manager', 'head', 'director', 'designer'].map((login) => ctx.loginAs(login)))
    await ctx.request('POST', '/channels/telegram/webhook', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET },
      body: {
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 777001, type: 'private' },
          from: { id: 777001, is_bot: false, first_name: 'Петр', username: 'petr_test' },
          text: 'Нужен баннер 3×6',
        },
      },
    })
    dealId = (await ctx.request('GET', '/inbox', { token: manager })).body.items[0].id
    await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { assigneeId: await ctx.userId('manager') } })
  })
  after(() => ctx.stop())

  it('счет без суммы сделки не формируется', async () => {
    const res = await ctx.request('POST', '/invoices', { token: manager, body: { dealId } })
    assert.equal(res.status, 400)
    assert.match(res.body.error.message, /сумму сделки/)
  })

  it('стадии «Счет выставлен» и «Оплачено» нельзя поставить вручную без счета', async () => {
    const invoiced = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'invoiced' } })
    assert.equal(invoiced.status, 400)
    const paid = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'paid' } })
    assert.equal(paid.status, 400)
    assert.match(paid.body.error.message, /автоматически/)
  })

  it('формирует счет в PDF с суммой сделки и переводит сделку в «Счет выставлен»', async () => {
    await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { amount: 18500, stage: 'proposal_sent' } })
    await ctx.request('PATCH', `/clients/${(await deal()).client.id}`, { token: manager, body: { company: 'ИП Соколов', inn: '123456789012', address: 'г. Тестовск' } })

    const res = await ctx.request('POST', '/invoices', { token: manager, body: { dealId } })
    assert.equal(res.status, 201)
    invoiceId = res.body.invoice.id
    assert.match(res.body.invoice.number, /^СЧ-\d{4}-0001$/)
    assert.equal(res.body.invoice.amount, 18500)
    assert.equal(res.body.invoice.status, 'pending')
    assert.equal((await deal()).stage, 'invoiced')

    const pdf = await ctx.download(`/invoices/${invoiceId}/pdf`, manager)
    assert.equal(pdf.status, 200)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-')
    assert.ok(pdf.content.length > 5000)

    // файл счета привязан к сделке и доступен через общий маршрут файлов
    assert.equal((await ctx.download(`/files/${res.body.invoice.fileId}`, manager)).status, 200)
    assert.equal((await ctx.download(`/files/${res.body.invoice.fileId}`, designer)).status, 404)
  })

  it('проверяет ИНН клиента', async () => {
    const res = await ctx.request('PATCH', `/clients/${(await deal()).client.id}`, { token: manager, body: { inn: '12345' } })
    assert.equal(res.status, 400)
    assert.match(res.body.error.message, /ИНН/)
  })

  it('отправляет PDF счета клиенту в Telegram и сохраняет это в переписке', async () => {
    const res = await ctx.request('POST', `/invoices/${invoiceId}/send`, { token: manager })
    assert.equal(res.status, 200)
    assert.ok(res.body.invoice.sentAt)
    const call = telegram.calls.find((item) => item.method === 'sendDocument')
    assert.equal(call.payload.chat_id, '777001')
    assert.match(call.payload.caption, /СЧ-\d{4}-0001/)
    assert.equal(call.payload.document.type, 'application/pdf')
    const { body } = await ctx.request('GET', `/deals/${dealId}`, { token: manager })
    assert.match(body.messages.at(-1).text, /Счет № СЧ-/)
  })

  it('дизайнер и директор не управляют счетами', async () => {
    assert.equal((await ctx.request('PATCH', `/invoices/${invoiceId}`, { token: designer, body: { status: 'paid' } })).status, 403)
    assert.equal((await ctx.request('PATCH', `/invoices/${invoiceId}`, { token: director, body: { status: 'paid' } })).status, 403)
  })

  it('отметка оплаты переводит сделку в «Оплачено» и создает проект с этапами', async () => {
    const res = await ctx.request('PATCH', `/invoices/${invoiceId}`, { token: head, body: { status: 'paid' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.invoice.status, 'paid')
    assert.equal(res.body.projectCreated, true)
    projectId = res.body.invoice.projectId
    assert.ok(projectId)

    const current = await deal()
    assert.equal(current.stage, 'paid')
    assert.ok(current.closedAt)
    assert.equal(current.projectId, projectId)

    const { body } = await ctx.request('GET', `/projects/${projectId}`, { token: manager })
    assert.deepEqual(body.project.stages.map((stage) => stage.code), ['design', 'approval', 'printing', 'placement', 'completed'])
    assert.equal(body.project.currentStage.code, 'design')
    assert.equal(body.project.manager.fullName, 'Анна Менеджер')
    assert.equal(body.canMarkStages, true)

    // ответственный менеджер узнает о новом проекте
    const notifications = await ctx.request('GET', '/notifications', { token: manager })
    assert.equal(notifications.body.items[0].type, 'project_created')
  })

  it('повторная отметка не создает второй проект, а откат оплаты запрещен', async () => {
    const again = await ctx.request('PATCH', `/invoices/${invoiceId}`, { token: head, body: { status: 'paid' } })
    assert.equal(again.body.projectCreated, false)
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM projects')
    assert.equal(rows[0].n, 1)

    const revert = await ctx.request('PATCH', `/invoices/${invoiceId}`, { token: head, body: { status: 'pending' } })
    assert.equal(revert.status, 409)
    const stage = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'qualification' } })
    assert.equal(stage.status, 400)
    const newInvoice = await ctx.request('POST', '/invoices', { token: manager, body: { dealId } })
    assert.equal(newInvoice.status, 400)
  })

  it('этапы отмечаются по порядку, клиент получает уведомление в Telegram', async () => {
    const skip = await ctx.request('POST', `/projects/${projectId}/stages/printing`, { token: manager, body: { done: true } })
    assert.equal(skip.status, 400)
    assert.match(skip.body.error.message, /Дизайн/)

    const sentBefore = telegram.calls.filter((call) => call.method === 'sendMessage').length
    const res = await ctx.request('POST', `/projects/${projectId}/stages/design`, { token: manager, body: { done: true } })
    assert.equal(res.status, 200)
    assert.equal(res.body.project.currentStage.code, 'approval')
    assert.equal(res.body.project.stages[0].doneBy.fullName, 'Анна Менеджер')
    assert.deepEqual(res.body.clientNotification, { sent: true })
    const sent = telegram.calls.filter((call) => call.method === 'sendMessage')
    assert.equal(sent.length, sentBefore + 1)
    assert.match(sent.at(-1).payload.text, /выполнен этап «Дизайн».*«Согласование»/)
  })

  it('одновременная отметка одного этапа (двойной клик) выполняется один раз', async () => {
    const sentBefore = telegram.calls.filter((call) => call.method === 'sendMessage').length
    const mark = () => ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: manager, body: { done: true } })
    const results = await Promise.all([mark(), mark(), mark()])
    assert.deepEqual(results.map((res) => res.status), [200, 200, 200])
    // клиент получил одно уведомление, а не три
    assert.equal(results.filter((res) => res.body.clientNotification?.sent).length, 1)
    assert.equal(telegram.calls.filter((call) => call.method === 'sendMessage').length, sentBefore + 1)
    // откатываем, чтобы следующие проверки шли от этапа «Согласование»
    await ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: manager, body: { done: false } })
  })

  it('отметить этап может только ответственный или руководитель', async () => {
    assert.equal((await ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: await ctx.loginAs('manager2'), body: { done: true } })).status, 403)
    assert.equal((await ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: director, body: { done: true } })).status, 403)
    assert.equal((await ctx.request('GET', '/projects', { token: designer })).status, 403)
  })

  it('отменить можно только последний выполненный этап', async () => {
    await ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: head, body: { done: true, notifyClient: false } })
    const undoFirst = await ctx.request('POST', `/projects/${projectId}/stages/design`, { token: manager, body: { done: false } })
    assert.equal(undoFirst.status, 400)
    const undoLast = await ctx.request('POST', `/projects/${projectId}/stages/approval`, { token: manager, body: { done: false } })
    assert.equal(undoLast.status, 200)
    assert.equal(undoLast.body.project.currentStage.code, 'approval')
  })

  it('после последнего этапа проект завершен; панель руководителя видит сводку', async () => {
    for (const code of ['approval', 'printing', 'placement', 'completed']) {
      const res = await ctx.request('POST', `/projects/${projectId}/stages/${code}`, { token: manager, body: { done: true, notifyClient: false } })
      assert.equal(res.status, 200)
    }
    const { body } = await ctx.request('GET', '/projects', { token: director })
    assert.equal(body.items[0].status, 'completed')
    assert.ok(body.items[0].completedAt)
    assert.equal(body.summary.completed, 1)
    assert.equal((await ctx.request('GET', '/projects?status=active', { token: director })).body.items.length, 0)

    // проект виден в карточке клиента
    const card = await ctx.request('GET', `/clients/${body.items[0].client.id}`, { token: manager })
    assert.equal(card.body.projects[0].id, projectId)
  })
})
