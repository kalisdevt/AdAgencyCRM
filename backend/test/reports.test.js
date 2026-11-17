import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp } from './helpers.js'

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date())

// Сценарии 5 и 7 из п. 6.2 ТЗ: отказ только с причиной и причина в отчете (FR-DEAL-03, FR-AN-03);
// руководитель видит KPI менеджеров и отчет по каналам за период (FR-AN-01, 04)
describe('Отчеты и справочники', () => {
  let ctx
  const tokens = {}
  const deals = {}
  const period = () => `?from=${today().slice(0, 8)}01&to=${today()}`

  async function lead(key, body) {
    await ctx.request('POST', '/public/leads', { body })
    const { rows } = await ctx.pool.query('SELECT max(id) AS id FROM deals')
    deals[key] = rows[0].id
  }
  const patchDeal = (key, body, token = tokens.manager) => ctx.request('PATCH', `/deals/${deals[key]}`, { token, body })

  before(async () => {
    ctx = await startTestApp()
    for (const login of ['admin', 'manager', 'manager2', 'head', 'marketer', 'director', 'designer']) tokens[login] = await ctx.loginAs(login)

    await lead('won', { name: 'Анна Первая', phone: '+7 900 000-00-01', utm_campaign: 'autumn', utm_source: 'yandex' })
    await lead('expensive', { name: 'Борис Второй', phone: '+7 900 000-00-02', utm_campaign: 'autumn' })
    await lead('late', { name: '=HYPERLINK("x")', phone: '+7 900 000-00-03' })
    await lead('open', { name: 'Дина Четвертая', phone: '+7 900 000-00-04', utm_campaign: 'expo' })

    await patchDeal('won', { assigneeId: await ctx.userId('manager'), amount: 10000 })
    const invoice = (await ctx.request('POST', '/invoices', { token: tokens.manager, body: { dealId: deals.won } })).body.invoice
    await ctx.request('PATCH', `/invoices/${invoice.id}`, { token: tokens.manager, body: { status: 'paid' } })
    // время первого ответа — 30 минут (обычно ставится при ответе клиенту)
    await ctx.pool.query(`UPDATE deals SET first_response_at = created_at + interval '30 minutes' WHERE id = $1`, [deals.won])

    await patchDeal('expensive', { assigneeId: await ctx.userId('manager2') })
    await patchDeal('open', { amount: 20000, stage: 'proposal_sent' })
  })
  after(() => ctx.stop())

  it('отказ без причины невозможен, с причиной — сохраняется', async () => {
    const noReason = await patchDeal('late', { stage: 'refused' })
    assert.equal(noReason.status, 400)
    assert.match(noReason.body.error.message, /причину отказа/)

    const reasons = (await ctx.request('GET', '/deals/refusal-reasons', { token: tokens.manager })).body.items
    const reasonId = (name) => reasons.find((reason) => reason.name === name).id
    assert.equal((await patchDeal('expensive', { stage: 'refused', refusalReasonId: reasonId('Дорого'), refusalComment: 'Нашли дешевле' })).status, 200)
    assert.equal((await patchDeal('late', { stage: 'refused', refusalReasonId: reasonId('Не устроили сроки') })).status, 200)
  })

  it('причины отказа отражаются в отчете за период', async () => {
    const { status, body } = await ctx.request('GET', `/reports/refusals${period()}`, { token: tokens.marketer })
    assert.equal(status, 200)
    assert.equal(body.total, 2)
    assert.deepEqual(body.reasons.map((reason) => [reason.name, reason.count]).sort(), [['Дорого', 1], ['Не устроили сроки', 1]])
    assert.equal(body.reasons[0].share, 0.5)
    assert.equal(body.deals.find((deal) => deal.reason === 'Дорого').comment, 'Нашли дешевле')
  })

  it('маркетолог вводит расходы на кампанию; отчет по каналам и кампаниям считает конверсию и стоимость привлечения', async () => {
    const campaigns = (await ctx.request('GET', '/dictionaries/campaigns', { token: tokens.marketer })).body.items
    const autumn = campaigns.find((campaign) => campaign.code === 'autumn')
    const added = await ctx.request('POST', '/reports/expenses', { token: tokens.marketer, body: { campaignId: autumn.id, spentOn: today(), amount: 5000, comment: 'Яндекс Директ' } })
    assert.equal(added.status, 201)
    assert.equal((await ctx.request('POST', '/reports/expenses', { token: tokens.marketer, body: { campaignId: autumn.id, spentOn: today(), amount: -1 } })).status, 400)
    assert.equal((await ctx.request('POST', '/reports/expenses', { token: tokens.manager, body: { campaignId: autumn.id, spentOn: today(), amount: 1 } })).status, 403)

    const { body } = await ctx.request('GET', `/reports/channels${period()}`, { token: tokens.head })
    const web = body.channels.find((row) => row.channel === 'web')
    assert.deepEqual([web.leads, web.won, web.refused, web.conversion, web.wonAmount], [4, 1, 2, 0.25, 10000])

    const row = body.campaigns.find((item) => item.code === 'autumn')
    assert.deepEqual([row.leads, row.won, row.expenses, row.costPerLead, row.costPerClient], [2, 1, 5000, 2500, 5000])
    assert.equal(body.campaigns.find((item) => item.name === 'Без кампании').leads, 1)
    assert.equal(body.total.expenses, 5000)
  })

  it('KPI менеджеров: лиды, конверсия, сумма и среднее время первого ответа', async () => {
    const { status, body } = await ctx.request('GET', `/reports/managers${period()}`, { token: tokens.head })
    assert.equal(status, 200)
    const anna = body.managers.find((row) => row.fullName === 'Анна Менеджер')
    assert.deepEqual([anna.leads, anna.processed, anna.won, anna.conversion, anna.wonAmount, anna.avgResponseMinutes], [1, 1, 1, 1, 10000, 30])
    const igor = body.managers.find((row) => row.fullName === 'Игорь Продажин')
    assert.deepEqual([igor.leads, igor.won, igor.refused, igor.conversion], [1, 0, 1, 0])
    assert.equal(body.unassignedLeads, 2)
  })

  it('ожидаемая выручка по открытым сделкам в разрезе стадий', async () => {
    const { body } = await ctx.request('GET', '/reports/revenue', { token: tokens.director })
    const sent = body.stages.find((stage) => stage.code === 'proposal_sent')
    assert.deepEqual([sent.count, sent.amount, sent.weightedAmount], [1, 20000, 10000])
    assert.equal(body.total.amount, 20000)
    assert.ok(!body.stages.some((stage) => ['paid', 'refused'].includes(stage.code)))
  })

  it('период фильтрует данные и проверяется', async () => {
    const past = await ctx.request('GET', '/reports/channels?from=2020-01-01&to=2020-01-31', { token: tokens.head })
    assert.equal(past.body.total.leads, 0)
    const reversed = await ctx.request('GET', '/reports/channels?from=2026-12-31&to=2026-01-01', { token: tokens.head })
    assert.equal(reversed.status, 400)
    const invalid = await ctx.request('GET', '/reports/channels?from=31.12.2026', { token: tokens.head })
    assert.equal(invalid.status, 400)
  })

  it('доступ к отчетам — по ролям', async () => {
    assert.equal((await ctx.request('GET', '/reports/managers', { token: tokens.marketer })).status, 403)
    assert.equal((await ctx.request('GET', '/reports/channels', { token: tokens.manager })).status, 403)
    assert.equal((await ctx.request('GET', '/reports/channels', { token: tokens.designer })).status, 403)
    assert.equal((await ctx.request('GET', '/reports/unknown', { token: tokens.head })).status, 404)
    const available = await ctx.request('GET', '/reports', { token: tokens.marketer })
    assert.deepEqual(available.body.reports, ['channels', 'refusals'])
    assert.equal(available.body.canEditExpenses, true)
  })

  it('выгружает отчеты в CSV для Excel и экранирует формулы', async () => {
    const csv = await ctx.download(`/reports/refusals/csv${period()}`, tokens.head)
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type'), /text\/csv/)
    assert.match(csv.headers.get('content-disposition'), /report-refusals-/)
    const text = csv.content.toString('utf8')
    assert.ok(text.startsWith('﻿'))
    assert.match(text, /Дата отказа;Сделка;Клиент;Причина/)
    assert.match(text, /'=HYPERLINK/)

    const channels = (await ctx.download(`/reports/channels/csv${period()}`, tokens.marketer)).content.toString('utf8')
    assert.match(channels, /Кампания;autumn;2;1;1;50;10000;5000;2500;5000/)
    assert.match(channels, /Канал;Сайт;4;1;2;25;10000;;;\r\n/)
  })

  it('справочники: администратор ведет причины отказа, маркетолог — кампании', async () => {
    const reason = await ctx.request('POST', '/dictionaries/refusal-reasons', { token: tokens.admin, body: { name: 'Не тот регион' } })
    assert.equal(reason.status, 201)
    assert.equal((await ctx.request('POST', '/dictionaries/refusal-reasons', { token: tokens.admin, body: { name: 'Не тот регион' } })).status, 409)
    assert.equal((await ctx.request('POST', '/dictionaries/refusal-reasons', { token: tokens.marketer, body: { name: 'Другое2' } })).status, 403)
    await ctx.request('PATCH', `/dictionaries/refusal-reasons/${reason.body.item.id}`, { token: tokens.admin, body: { isActive: false } })
    const active = (await ctx.request('GET', '/deals/refusal-reasons', { token: tokens.manager })).body.items
    assert.ok(!active.some((item) => item.name === 'Не тот регион'))

    const campaign = await ctx.request('POST', '/dictionaries/campaigns', { token: tokens.marketer, body: { code: 'winter-2027', name: 'Зимняя акция' } })
    assert.equal(campaign.status, 201)
    assert.equal((await ctx.request('POST', '/dictionaries/campaigns', { token: tokens.marketer, body: { code: 'WINTER-2027', name: 'Дубль' } })).status, 409)
    assert.equal((await ctx.request('POST', '/dictionaries/campaigns', { token: tokens.manager, body: { code: 'x-1', name: 'Нельзя' } })).status, 403)

    // FR-DEAL-02: кампания выбирается в сделке вручную
    const assigned = await patchDeal('open', { campaignId: campaign.body.item.id })
    assert.equal(assigned.body.deal.campaign, 'Зимняя акция')
    await ctx.request('PATCH', `/dictionaries/campaigns/${campaign.body.item.id}`, { token: tokens.marketer, body: { isActive: false } })
    assert.equal((await patchDeal('open', { campaignId: campaign.body.item.id })).status, 400)
  })

  it('руководитель открывает переписку по сделке любого менеджера (FR-AN-06)', async () => {
    const res = await ctx.request('GET', `/deals/${deals.expensive}`, { token: tokens.head })
    assert.equal(res.status, 200)
    assert.equal(res.body.deal.assignee.fullName, 'Игорь Продажин')
    assert.ok(res.body.messages.length > 0)
  })

  it('название сделки можно изменить', async () => {
    const res = await patchDeal('open', { title: 'Вывеска для выставки' })
    assert.equal(res.body.deal.title, 'Вывеска для выставки')
  })
})
