import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp, TEST_PASSWORD } from './helpers.js'

describe('Вход и роли', () => {
  let ctx
  before(async () => { ctx = await startTestApp() })
  after(() => ctx.stop())

  it('health-check отвечает и проверяет БД', async () => {
    const res = await ctx.request('GET', '/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.database, 'ok')
  })

  it('выдает токен по верным данным и не возвращает хеш пароля', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: { login: 'Manager', password: TEST_PASSWORD } })
    assert.equal(res.status, 200)
    assert.equal(res.body.user.role, 'manager')
    assert.ok(res.body.token)
    assert.ok(!JSON.stringify(res.body).includes('password'))

    const me = await ctx.request('GET', '/auth/me', { token: res.body.token })
    assert.equal(me.body.user.login, 'manager')
  })

  it('принимает вход по рабочей почте', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: { login: 'manager@agency.test', password: TEST_PASSWORD } })
    assert.equal(res.status, 200)
  })

  it('отклоняет неверный пароль и пустые поля понятным сообщением', async () => {
    const wrong = await ctx.request('POST', '/auth/login', { body: { login: 'manager', password: 'nope' } })
    assert.equal(wrong.status, 401)
    assert.equal(wrong.body.error.message, 'Неверный логин или пароль')

    const empty = await ctx.request('POST', '/auth/login', { body: {} })
    assert.equal(empty.status, 400)
    assert.equal(empty.body.error.code, 'validation_error')
  })

  it('не пускает без токена и с чужой ролью', async () => {
    assert.equal((await ctx.request('GET', '/users')).status, 401)
    assert.equal((await ctx.request('GET', '/users', { token: 'garbage' })).status, 401)
    const manager = await ctx.loginAs('manager')
    assert.equal((await ctx.request('GET', '/users', { token: manager })).status, 403)
  })

  it('пароли хранятся только в виде bcrypt-хеша', async () => {
    const { rows } = await ctx.pool.query('SELECT password_hash FROM users')
    for (const row of rows) assert.match(row.password_hash, /^\$2[aby]\$/)
  })

  describe('администратор управляет учетными записями', () => {
    let admin
    let createdId
    before(async () => { admin = await ctx.loginAs('admin') })

    it('создает сотрудника, который затем может войти', async () => {
      const res = await ctx.request('POST', '/users', {
        token: admin,
        body: { login: 'new.designer', fullName: 'Новый Дизайнер', password: 'designer-pass', role: 'designer' },
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.user.role, 'designer')
      createdId = res.body.user.id

      const login = await ctx.request('POST', '/auth/login', { body: { login: 'new.designer', password: 'designer-pass' } })
      assert.equal(login.status, 200)
    })

    it('отклоняет повтор логина, короткий пароль и неизвестную роль', async () => {
      const base = { login: 'someone', fullName: 'Кто-то', password: 'long-enough', role: 'manager' }
      const dup = await ctx.request('POST', '/users', { token: admin, body: { ...base, login: 'MANAGER' } })
      assert.equal(dup.status, 409)
      const short = await ctx.request('POST', '/users', { token: admin, body: { ...base, password: '123' } })
      assert.equal(short.status, 400)
      const role = await ctx.request('POST', '/users', { token: admin, body: { ...base, role: 'root' } })
      assert.equal(role.status, 400)
      const client = await ctx.request('POST', '/users', { token: admin, body: { ...base, role: 'client' } })
      assert.equal(client.status, 400)
    })

    it('меняет роль и блокирует: блокировка действует на уже выданный токен', async () => {
      const token = (await ctx.request('POST', '/auth/login', { body: { login: 'new.designer', password: 'designer-pass' } })).body.token

      const changed = await ctx.request('PATCH', `/users/${createdId}`, { token: admin, body: { role: 'marketer' } })
      assert.equal(changed.body.user.role, 'marketer')

      const blocked = await ctx.request('PATCH', `/users/${createdId}`, { token: admin, body: { isActive: false } })
      assert.equal(blocked.body.user.isActive, false)

      assert.equal((await ctx.request('GET', '/auth/me', { token })).status, 401)
      const login = await ctx.request('POST', '/auth/login', { body: { login: 'new.designer', password: 'designer-pass' } })
      assert.equal(login.status, 401)
      assert.match(login.body.error.message, /заблокирована/)
    })

    it('не дает администратору заблокировать себя или снять с себя роль', async () => {
      const me = (await ctx.request('GET', '/auth/me', { token: admin })).body.user
      assert.equal((await ctx.request('PATCH', `/users/${me.id}`, { token: admin, body: { isActive: false } })).status, 400)
      assert.equal((await ctx.request('PATCH', `/users/${me.id}`, { token: admin, body: { role: 'manager' } })).status, 400)
    })

    it('возвращает 404 для несуществующего пользователя', async () => {
      assert.equal((await ctx.request('PATCH', '/users/999999', { token: admin, body: { isActive: false } })).status, 404)
      assert.equal((await ctx.request('PATCH', '/users/abc', { token: admin, body: {} })).status, 404)
    })
  })
})
