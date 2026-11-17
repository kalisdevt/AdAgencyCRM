import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp } from './helpers.js'

const CLIENT_PASSWORD = 'client-pass-1'

// Сценарий 6 из п. 6.2 ТЗ: клиент входит в личный кабинет и видит текущий этап
// своего проекта и архив (FR-PORT-01, 02); чужие заказы ему недоступны (ТЗ п. 4.7)
describe('Личный кабинет клиента', () => {
  let ctx
  let manager
  let head
  let client
  let clientId
  let otherClientId
  let activeProjectId
  let archivedProjectId
  let otherProjectId
  let invoiceIds = []

  // Обращение с сайта → сумма → счет → оплата → проект
  async function paidDeal({ name, email, message }) {
    await ctx.request('POST', '/public/leads', { body: { name, email, message } })
    const { rows } = await ctx.pool.query(
      `SELECT d.id, d.client_id FROM deals d JOIN clients c ON c.id = d.client_id WHERE lower(c.email) = lower($1) ORDER BY d.id DESC LIMIT 1`,
      [email],
    )
    const [deal] = rows
    await ctx.request('PATCH', `/deals/${deal.id}`, { token: manager, body: { amount: 10000 } })
    const invoice = (await ctx.request('POST', '/invoices', { token: manager, body: { dealId: deal.id } })).body.invoice
    const paid = await ctx.request('PATCH', `/invoices/${invoice.id}`, { token: head, body: { status: 'paid' } })
    return { dealId: deal.id, clientId: deal.client_id, projectId: paid.body.invoice.projectId, invoiceId: invoice.id }
  }

  before(async () => {
    ctx = await startTestApp()
    manager = await ctx.loginAs('manager')
    head = await ctx.loginAs('head')

    const first = await paidDeal({ name: 'Ирина Волкова', email: 'irina@example.test', message: 'Баннер' })
    clientId = first.clientId
    archivedProjectId = first.projectId
    for (const code of ['design', 'approval', 'printing', 'placement', 'completed']) {
      await ctx.request('POST', `/projects/${archivedProjectId}/stages/${code}`, { token: head, body: { done: true } })
    }
    const second = await paidDeal({ name: 'Ирина Волкова', email: 'irina@example.test', message: 'Листовки' })
    activeProjectId = second.projectId
    await ctx.request('POST', `/projects/${activeProjectId}/stages/design`, { token: head, body: { done: true } })
    invoiceIds = [first.invoiceId, second.invoiceId]
    // еще одна заявка без оплаты — текущий заказ
    await ctx.request('POST', '/public/leads', { body: { name: 'Ирина', email: 'irina@example.test', message: 'Визитки' } })

    const other = await paidDeal({ name: 'Чужой клиент', email: 'other@example.test', message: 'Вывеска' })
    otherClientId = other.clientId
    otherProjectId = other.projectId
  })
  after(() => ctx.stop())

  it('менеджер создает учетную запись клиента из карточки клиента', async () => {
    const res = await ctx.request('POST', `/clients/${clientId}/account`, { token: manager, body: { login: 'irina', password: CLIENT_PASSWORD } })
    assert.equal(res.status, 201)
    assert.equal(res.body.portalAccounts[0].login, 'irina')

    const duplicate = await ctx.request('POST', `/clients/${otherClientId}/account`, { token: manager, body: { login: 'irina', password: CLIENT_PASSWORD } })
    assert.equal(duplicate.status, 409)
    const short = await ctx.request('POST', `/clients/${otherClientId}/account`, { token: manager, body: { login: 'other', password: '123' } })
    assert.equal(short.status, 400)
    const designer = await ctx.loginAs('designer')
    assert.equal((await ctx.request('POST', `/clients/${otherClientId}/account`, { token: designer, body: { login: 'x-user', password: CLIENT_PASSWORD } })).status, 403)
  })

  it('клиент входит и видит текущие заказы, этап проекта и архив', async () => {
    const login = await ctx.request('POST', '/auth/login', { body: { login: 'irina', password: CLIENT_PASSWORD } })
    assert.equal(login.status, 200)
    assert.equal(login.body.user.role, 'client')
    client = login.body.token

    const { status, body } = await ctx.request('GET', '/portal', { token: client })
    assert.equal(status, 200)
    assert.equal(body.client.name, 'Ирина Волкова')
    assert.deepEqual(body.activeProjects.map((project) => project.id), [activeProjectId])
    assert.equal(body.activeProjects[0].currentStage.name, 'Согласование')
    assert.deepEqual(body.archive.map((project) => project.id), [archivedProjectId])
    assert.equal(body.orders.length, 1)
    assert.equal(body.orders[0].status, 'Заявка принята')
    assert.equal(body.invoices.length, 2)
    // внутренние данные (переписка, ответственные за этапы) клиенту не отдаются
    assert.ok(!('doneBy' in body.activeProjects[0].stages[0]))
  })

  it('клиент не видит чужие проекты и счета и не имеет доступа к рабочим разделам', async () => {
    assert.equal((await ctx.request('GET', `/portal/projects/${activeProjectId}`, { token: client })).status, 200)
    assert.equal((await ctx.request('GET', `/portal/projects/${otherProjectId}`, { token: client })).status, 404)

    assert.equal((await ctx.download(`/portal/invoices/${invoiceIds[0]}/pdf`, client)).status, 200)
    const otherInvoice = (await ctx.pool.query('SELECT max(id) AS id FROM invoices')).rows[0].id
    assert.equal((await ctx.download(`/portal/invoices/${otherInvoice}/pdf`, client)).status, 404)

    for (const path of ['/inbox', '/projects', '/tasks', `/clients/${clientId}`, '/invoices?dealId=1', '/users']) {
      assert.equal((await ctx.request('GET', path, { token: client })).status, 403, path)
    }
    const { rows } = await ctx.pool.query('SELECT file_id FROM invoices WHERE id = $1', [invoiceIds[0]])
    assert.equal((await ctx.download(`/files/${rows[0].file_id}`, client)).status, 404)
  })

  it('сотрудник не открывает кабинет клиента', async () => {
    assert.equal((await ctx.request('GET', '/portal', { token: manager })).status, 403)
  })

  it('менеджер блокирует учетную запись клиента — вход и токен перестают работать', async () => {
    const accountId = (await ctx.request('GET', `/clients/${clientId}`, { token: manager })).body.portalAccounts[0].id
    const foreign = await ctx.request('PATCH', `/clients/${otherClientId}/account/${accountId}`, { token: manager, body: { isActive: false } })
    assert.equal(foreign.status, 404)

    const blocked = await ctx.request('PATCH', `/clients/${clientId}/account/${accountId}`, { token: manager, body: { isActive: false } })
    assert.equal(blocked.status, 200)
    assert.equal(blocked.body.portalAccounts[0].isActive, false)
    assert.equal((await ctx.request('GET', '/portal', { token: client })).status, 401)

    // нельзя через этот маршрут сменить роль клиента
    const role = await ctx.request('PATCH', `/clients/${clientId}/account/${accountId}`, { token: manager, body: { role: 'admin' } })
    assert.equal(role.status, 200)
    const { rows } = await ctx.pool.query(`SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [accountId])
    assert.equal(rows[0].code, 'client')
  })
})
