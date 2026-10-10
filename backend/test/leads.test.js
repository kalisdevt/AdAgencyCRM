import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createChannels } from '../src/modules/channels/index.js'
import { normalizePhone } from '../src/modules/leads/contacts.js'
import { startTestApp } from './helpers.js'

const WEBHOOK_SECRET = 'test-webhook-secret'

// Подмена Telegram Bot API: запоминает исходящие вызовы и отвечает как настоящий сервер
function fakeTelegram() {
  const calls = []
  let failNext = false
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body)
    calls.push({ method: url.split('/').pop(), payload })
    if (failNext) {
      failNext = false
      return Response.json({ ok: false, description: 'Forbidden: bot was blocked by the user' }, { status: 403 })
    }
    return Response.json({ ok: true, result: { message_id: 9000 + calls.length, chat: { id: payload.chat_id } } })
  }
  return { calls, fetchImpl, failOnce: () => { failNext = true } }
}

function telegramUpdate({ messageId, chatId = 555001, text = 'Здравствуйте, нужен баннер 3×6', firstName = 'Петр', ...rest }) {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, is_bot: false, first_name: firstName, last_name: 'Тестов', username: `user${chatId}` },
      text,
      ...rest,
    },
  }
}

describe('Прием обращений и лента «Входящие»', () => {
  let ctx
  let telegram
  let manager
  let managerId

  const webhook = (update, secret = WEBHOOK_SECRET) =>
    ctx.request('POST', '/channels/telegram/webhook', { body: update, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret } })
  const inbox = (query = '') => ctx.request('GET', `/inbox${query}`, { token: manager })
  const count = async (table) => (await ctx.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n

  before(async () => {
    telegram = fakeTelegram()
    ctx = await startTestApp({
      channels: createChannels({ telegram: { token: 'test-token', fetchImpl: telegram.fetchImpl } }),
      telegramWebhookSecret: WEBHOOK_SECRET,
    })
    manager = await ctx.loginAs('manager')
    managerId = (await ctx.request('GET', '/auth/me', { token: manager })).body.user.id
  })
  after(() => ctx.stop())

  it('нормализует телефон к единому виду', () => {
    assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567')
    assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567')
    assert.equal(normalizePhone('9991234567'), '+79991234567')
    assert.equal(normalizePhone('12345'), null)
  })

  describe('Telegram', () => {
    it('отклоняет вебхук без верного секрета', async () => {
      assert.equal((await webhook(telegramUpdate({ messageId: 1 }), 'wrong')).status, 403)
      assert.equal(await count('messages'), 0)
    })

    it('первое сообщение создает клиента, контакт, лид и сообщение', async () => {
      const res = await webhook(telegramUpdate({ messageId: 1 }))
      assert.equal(res.status, 200)

      const { body } = await inbox()
      assert.equal(body.items.length, 1)
      const [lead] = body.items
      assert.equal(lead.stage, 'new')
      assert.equal(lead.channel, 'telegram')
      assert.equal(lead.client.name, 'Петр Тестов')
      assert.equal(lead.unread, 1)
      assert.equal(lead.assignee, null)
      assert.equal(lead.lastMessage.text, 'Здравствуйте, нужен баннер 3×6')
      assert.equal(body.unreadTotal, 1)
      assert.equal(await count('client_contacts'), 1)
    })

    it('повторная доставка того же сообщения не создает дубликат', async () => {
      const res = await webhook(telegramUpdate({ messageId: 1 }))
      assert.equal(res.status, 200)
      assert.equal(res.body.duplicate, true)
      assert.equal(await count('messages'), 1)
      assert.equal(await count('deals'), 1)
      assert.equal(await count('clients'), 1)
    })

    it('одновременная доставка одного сообщения сохраняет его один раз', async () => {
      const update = telegramUpdate({ messageId: 50, chatId: 555777, firstName: 'Гонка' })
      const results = await Promise.all(Array.from({ length: 6 }, () => webhook(update)))
      assert.ok(results.every((res) => res.status === 200))
      const { rows } = await ctx.pool.query(`SELECT count(*)::int AS n FROM messages WHERE external_id = '555777:50'`)
      assert.equal(rows[0].n, 1)
      const clients = await ctx.pool.query(`SELECT count(*)::int AS n FROM client_contacts WHERE external_id = '555777'`)
      assert.equal(clients.rows[0].n, 1)
    })

    it('следующее сообщение того же клиента попадает в ту же сделку', async () => {
      await webhook(telegramUpdate({ messageId: 2, text: 'И еще визитки' }))
      const { body } = await inbox('?channel=telegram')
      const lead = body.items.find((item) => item.client.name === 'Петр Тестов')
      assert.equal(lead.unread, 2)
      assert.equal(lead.lastMessage.text, 'И еще визитки')
      assert.equal((await ctx.pool.query(`SELECT count(*)::int AS n FROM deals WHERE client_id = $1`, [lead.client.id])).rows[0].n, 1)
    })

    it('не считает обращением /start, сообщения ботов и групповые чаты', async () => {
      const before = await count('messages')
      await webhook(telegramUpdate({ messageId: 70, chatId: 555900, text: '/start' }))
      const group = telegramUpdate({ messageId: 71, chatId: 555901 })
      group.message.chat.type = 'group'
      await webhook(group)
      const bot = telegramUpdate({ messageId: 72, chatId: 555902 })
      bot.message.from.is_bot = true
      await webhook(bot)
      assert.equal((await webhook({ update_id: 73 })).status, 200)
      assert.equal(await count('messages'), before)
      // на /start бот отвечает приветствием
      assert.equal(telegram.calls.at(-1).payload.chat_id, '555900')
    })
  })

  describe('Веб-форма сайта', () => {
    const form = {
      name: 'Ирина Сайтова',
      phone: '8 (912) 000-11-22',
      message: 'Нужна наружная реклама',
      utm_source: 'yandex',
      utm_medium: 'cpc',
      utm_campaign: 'autumn-2026',
      requestId: 'req-00000001',
    }

    it('принимает заявку без авторизации и сохраняет UTM-метки и кампанию', async () => {
      const res = await ctx.request('POST', '/public/leads', { body: form })
      assert.equal(res.status, 201)
      assert.equal(res.body.accepted, true)

      const { body } = await inbox('?channel=web')
      assert.equal(body.items.length, 1)
      const [lead] = body.items
      assert.equal(lead.client.phone, '+79120001122')
      assert.deepEqual(lead.utm, { source: 'yandex', medium: 'cpc', campaign: 'autumn-2026' })
      assert.equal(lead.campaign, 'autumn-2026')
    })

    it('повторная отправка той же формы не создает дубликат', async () => {
      const res = await ctx.request('POST', '/public/leads', { body: form })
      assert.equal(res.status, 200)
      assert.equal(res.body.duplicate, true)
      assert.equal((await inbox('?channel=web')).body.items.length, 1)
    })

    it('находит существующего клиента по телефону, записанному иначе', async () => {
      const clientsBefore = await count('clients')
      await ctx.request('POST', '/public/leads', { body: { name: 'Ирина', phone: '+7 912 000 11 22', message: 'Уточнение' } })
      assert.equal(await count('clients'), clientsBefore)
      const { body } = await inbox('?channel=web')
      assert.equal(body.items.length, 1)
      assert.equal(body.items[0].unread, 2)
    })

    it('находит клиента по e-mail без учета регистра', async () => {
      await ctx.request('POST', '/public/leads', { body: { name: 'Олег Почтов', email: 'Oleg@Example.com' } })
      const clientsBefore = await count('clients')
      await ctx.request('POST', '/public/leads', { body: { name: 'Олег', email: 'oleg@example.com', message: 'Повторно' } })
      assert.equal(await count('clients'), clientsBefore)
    })

    it('отклоняет некорректные данные понятным сообщением и ничего не сохраняет', async () => {
      const messagesBefore = await count('messages')
      const noContact = await ctx.request('POST', '/public/leads', { body: { name: 'Без контакта' } })
      assert.equal(noContact.status, 400)
      assert.match(noContact.body.error.message, /телефон или почту/)

      const badPhone = await ctx.request('POST', '/public/leads', { body: { name: 'Тест', phone: '12' } })
      assert.equal(badPhone.status, 400)
      const badEmail = await ctx.request('POST', '/public/leads', { body: { name: 'Тест', email: 'not-an-email' } })
      assert.equal(badEmail.status, 400)
      const noName = await ctx.request('POST', '/public/leads', { body: { phone: '+79990000000' } })
      assert.equal(noName.status, 400)
      assert.equal(await count('messages'), messagesBefore)
    })
  })

  describe('Лента и работа с обращением', () => {
    let dealId
    before(async () => {
      dealId = (await inbox('?channel=telegram')).body.items.find((item) => item.client.name === 'Петр Тестов').id
    })

    it('доступна только сотрудникам продаж', async () => {
      assert.equal((await ctx.request('GET', '/inbox')).status, 401)
      const designer = await ctx.loginAs('designer')
      assert.equal((await ctx.request('GET', '/inbox', { token: designer })).status, 403)
      assert.equal((await ctx.request('GET', `/deals/${dealId}`, { token: designer })).status, 403)
    })

    it('фильтрует по каналу, непрочитанным и отклоняет неизвестный фильтр', async () => {
      const all = (await inbox()).body.items
      const web = (await inbox('?channel=web')).body.items
      assert.ok(web.length > 0 && web.length < all.length)
      assert.ok(web.every((item) => item.channel === 'web'))
      assert.equal((await inbox('?unread=1')).body.items.length, all.length)
      assert.equal((await inbox('?stage=paid')).body.items.length, 0)
      assert.equal((await inbox('?channel=fax')).status, 400)
    })

    it('назначает ответственного и фильтрует по нему', async () => {
      assert.equal((await inbox('?assignee=me')).body.items.length, 0)
      const res = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { assigneeId: managerId } })
      assert.equal(res.status, 200)
      assert.equal(res.body.deal.assignee.id, managerId)
      assert.deepEqual((await inbox('?assignee=me')).body.items.map((item) => item.id), [dealId])
      assert.ok((await inbox('?assignee=none')).body.items.every((item) => item.id !== dealId))

      const designers = await ctx.pool.query(`SELECT id FROM users WHERE login = 'designer'`)
      const wrong = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { assigneeId: designers.rows[0].id } })
      assert.equal(wrong.status, 400)
    })

    it('показывает переписку и отмечает сообщения прочитанными', async () => {
      const card = await ctx.request('GET', `/deals/${dealId}`, { token: manager })
      assert.equal(card.status, 200)
      assert.equal(card.body.messages.length, 2)
      assert.equal(card.body.replyUnavailableReason, null)
      assert.equal(card.body.contacts[0].channel, 'telegram')

      assert.equal((await ctx.request('POST', `/deals/${dealId}/read`, { token: manager })).status, 204)
      const lead = (await inbox()).body.items.find((item) => item.id === dealId)
      assert.equal(lead.unread, 0)
    })

    it('отправляет ответ клиенту в Telegram и сохраняет его в истории', async () => {
      const res = await ctx.request('POST', `/deals/${dealId}/messages`, { token: manager, body: { text: 'Добрый день! Уточните размеры.' } })
      assert.equal(res.status, 201)
      assert.equal(res.body.message.direction, 'out')

      const sent = telegram.calls.at(-1)
      assert.equal(sent.method, 'sendMessage')
      assert.deepEqual(sent.payload, { chat_id: '555001', text: 'Добрый день! Уточните размеры.' })

      const card = await ctx.request('GET', `/deals/${dealId}`, { token: manager })
      assert.equal(card.body.messages.at(-1).text, 'Добрый день! Уточните размеры.')
      assert.ok(card.body.deal.firstResponseAt)
    })

    it('при ошибке Telegram ответ не сохраняется, пользователь видит причину', async () => {
      const before = await count('messages')
      telegram.failOnce()
      const res = await ctx.request('POST', `/deals/${dealId}/messages`, { token: manager, body: { text: 'Не дойдет' } })
      assert.equal(res.status, 502)
      assert.match(res.body.error.message, /Не удалось отправить/)
      assert.equal(await count('messages'), before)
    })

    it('не дает ответить на заявку с сайта и отправить пустой текст', async () => {
      const webDeal = (await inbox('?channel=web')).body.items[0]
      const res = await ctx.request('POST', `/deals/${webDeal.id}/messages`, { token: manager, body: { text: 'Привет' } })
      assert.equal(res.status, 422)
      const empty = await ctx.request('POST', `/deals/${dealId}/messages`, { token: manager, body: { text: '   ' } })
      assert.equal(empty.status, 400)
    })

    it('переводит сделку по стадиям; «Отказ» только с причиной из справочника', async () => {
      const moved = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'qualification', amount: 45000 } })
      assert.equal(moved.body.deal.stage, 'qualification')
      assert.equal(moved.body.deal.amount, 45000)

      const noReason = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'refused' } })
      assert.equal(noReason.status, 400)
      assert.match(noReason.body.error.message, /причину отказа/)
      const unknown = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'refused', refusalReasonId: 9999 } })
      assert.equal(unknown.status, 400)

      const reasons = (await ctx.request('GET', '/deals/refusal-reasons', { token: manager })).body.items
      const refused = await ctx.request('PATCH', `/deals/${dealId}`, {
        token: manager,
        body: { stage: 'refused', refusalReasonId: reasons[0].id, refusalComment: 'Бюджет меньше' },
      })
      assert.equal(refused.status, 200)
      assert.equal(refused.body.deal.refusalReason, reasons[0].name)
      assert.equal(refused.body.deal.refusalComment, 'Бюджет меньше')
      assert.ok(refused.body.deal.closedAt)

      assert.equal((await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'archive' } })).status, 400)
      assert.equal((await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { amount: -1 } })).status, 400)
    })

    it('после закрытия сделки новое сообщение создает новый лид и помечает повторного клиента', async () => {
      await webhook(telegramUpdate({ messageId: 3, text: 'Передумал, давайте обсудим' }))
      const leads = (await inbox('?channel=telegram')).body.items.filter((item) => item.client.name === 'Петр Тестов')
      assert.equal(leads.length, 2)
      const fresh = leads.find((item) => item.id !== dealId)
      assert.equal(fresh.stage, 'new')
      assert.equal(fresh.client.isReturning, true)
    })

    it('возврат из «Отказа» снимает причину и дату закрытия', async () => {
      const res = await ctx.request('PATCH', `/deals/${dealId}`, { token: manager, body: { stage: 'proposal_prep' } })
      assert.equal(res.body.deal.refusalReason, null)
      assert.equal(res.body.deal.refusalComment, null)
      assert.equal(res.body.deal.closedAt, null)
    })

    it('карточка клиента содержит контакты, сделки и всю переписку; данные можно править', async () => {
      const clientId = (await ctx.request('GET', `/deals/${dealId}`, { token: manager })).body.deal.client.id
      const card = await ctx.request('GET', `/clients/${clientId}`, { token: manager })
      assert.equal(card.status, 200)
      assert.equal(card.body.deals.length, 2)
      assert.equal(card.body.contacts[0].username, 'user555001')
      assert.equal(card.body.messages.length, 4)
      assert.deepEqual(card.body.projects, [])

      const saved = await ctx.request('PATCH', `/clients/${clientId}`, { token: manager, body: { company: 'ООО «Тест»', phone: '8 900 555-44-33' } })
      assert.equal(saved.body.client.company, 'ООО «Тест»')
      assert.equal(saved.body.client.phone, '+79005554433')
      assert.equal((await ctx.request('PATCH', `/clients/${clientId}`, { token: manager, body: { phone: 'abc' } })).status, 400)
      assert.equal((await ctx.request('GET', '/clients/999999', { token: manager })).status, 404)
    })
  })
})
