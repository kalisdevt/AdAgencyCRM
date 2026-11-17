import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { seedScenario } from '../src/db/demo-scenario.js'
import { seedInquiries } from '../src/db/seed.js'
import { startTestApp, TEST_PASSWORD } from './helpers.js'

// Демо-данные (ТЗ п. 7) создаются теми же сервисами, что и интерфейс: проверяем, что
// сценарий проходит целиком, покрывает все стадии и не дублируется при повторном запуске
describe('Демонстрационный набор данных', () => {
  let ctx
  before(async () => {
    ctx = await startTestApp()
    await seedInquiries(ctx.pool)
  })
  after(() => ctx.stop())

  const count = async (sql) => (await ctx.pool.query(sql)).rows[0].n

  it('создает сделки на всех стадиях, задачи, счета, проекты и расходы', async () => {
    assert.equal(await seedScenario(ctx.pool, ctx.storage, { clientPassword: TEST_PASSWORD }), true)
    const { rows } = await ctx.pool.query('SELECT DISTINCT stage FROM deals')
    assert.deepEqual(rows.map((row) => row.stage).sort(), ['invoiced', 'new', 'paid', 'proposal_prep', 'proposal_sent', 'qualification', 'refused'])
    assert.equal(await count(`SELECT count(*)::int AS n FROM projects WHERE status = 'completed'`), 1)
    assert.equal(await count(`SELECT count(*)::int AS n FROM projects WHERE status = 'active'`), 1)
    assert.equal(await count(`SELECT count(*)::int AS n FROM tasks`), 2)
    assert.equal(await count(`SELECT count(*)::int AS n FROM files WHERE task_id IS NOT NULL`), 1)
    assert.equal(await count(`SELECT count(*)::int AS n FROM invoices`), 3)
    assert.equal(await count(`SELECT count(*)::int AS n FROM campaign_expenses`), 2)
  })

  it('клиент из демо-набора видит проект в работе и архив', async () => {
    const token = await ctx.loginAs('client')
    const { body } = await ctx.request('GET', '/portal', { token })
    assert.equal(body.activeProjects.length, 1)
    assert.equal(body.activeProjects[0].currentStage.code, 'printing')
    assert.equal(body.archive.length, 1)
  })

  it('отчеты по демо-данным не пустые', async () => {
    const head = await ctx.loginAs('head')
    const channels = await ctx.request('GET', '/reports/channels', { token: head })
    assert.ok(channels.body.total.leads >= 8)
    assert.ok(channels.body.total.costPerLead > 0)
    const managers = await ctx.request('GET', '/reports/managers', { token: head })
    assert.ok(managers.body.managers.some((row) => row.avgResponseMinutes !== null))
    const refusals = await ctx.request('GET', '/reports/refusals', { token: head })
    assert.equal(refusals.body.total, 2)
  })

  it('повторный запуск ничего не дублирует', async () => {
    assert.equal(await seedScenario(ctx.pool, ctx.storage, { clientPassword: TEST_PASSWORD }), false)
    assert.equal(await count(`SELECT count(*)::int AS n FROM projects`), 2)
  })
})
