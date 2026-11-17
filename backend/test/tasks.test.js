import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { startTestApp } from './helpers.js'

// 1×1 PNG — «макет» для проверки загрузки и просмотра
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

// Сценарий 3 из п. 6.2 ТЗ: менеджер ставит задачу на КП дизайнеру, дизайнер видит уведомление,
// загружает макет, менеджер видит макет в карточке сделки (FR-TASK-01–03)
for (const storageKind of ['disk', 'db']) {
  describe(`Задачи и макеты (хранилище: ${storageKind})`, () => {
    let ctx
    let manager
    let designer
    let marketer
    let designerId
    let dealId
    let taskId

    before(async () => {
      ctx = await startTestApp({ storageKind })
      manager = await ctx.loginAs('manager')
      designer = await ctx.loginAs('designer')
      marketer = await ctx.loginAs('marketer')
      designerId = await ctx.userId('designer')
      await ctx.request('POST', '/public/leads', {
        body: { name: 'Кофейня «Зерно»', phone: '+7 900 100-20-30', message: 'Нужна вывеска' },
      })
      dealId = (await ctx.request('GET', '/inbox', { token: manager })).body.items[0].id
    })
    after(() => ctx.stop())

    it('менеджер создает задачу из сделки, исполнитель получает уведомление', async () => {
      const res = await ctx.request('POST', '/tasks', {
        token: manager,
        body: { dealId, title: 'Макет вывески для КП', description: 'Световой короб 2×0,6 м', assigneeId: designerId, dueDate: '2026-12-01' },
      })
      assert.equal(res.status, 201)
      taskId = res.body.task.id
      assert.equal(res.body.task.status, 'new')
      assert.equal(res.body.task.dueDate, '2026-12-01')
      assert.equal(res.body.task.deal.id, dealId)

      const notifications = await ctx.request('GET', '/notifications', { token: designer })
      assert.equal(notifications.body.unread, 1)
      assert.equal(notifications.body.items[0].type, 'task_assigned')
      assert.equal(notifications.body.items[0].link, `/tasks/${taskId}`)
      // постановщику о собственном действии уведомление не приходит
      assert.equal((await ctx.request('GET', '/notifications/unread-count', { token: manager })).body.unread, 0)
    })

    it('проверяет данные задачи на сервере', async () => {
      const noAssignee = await ctx.request('POST', '/tasks', { token: manager, body: { dealId, title: 'Без исполнителя' } })
      assert.equal(noAssignee.status, 400)
      assert.match(noAssignee.body.error.message, /исполнителя/)

      const badDate = await ctx.request('POST', '/tasks', {
        token: manager,
        body: { dealId, title: 'Задача', assigneeId: designerId, dueDate: '01.12.2026' },
      })
      assert.equal(badDate.status, 400)

      const noDeal = await ctx.request('POST', '/tasks', {
        token: manager,
        body: { dealId: 999999, title: 'Задача', assigneeId: designerId },
      })
      assert.equal(noDeal.status, 400)
      assert.match(noDeal.body.error.message, /Сделка/)

      const ghost = await ctx.request('POST', '/tasks', { token: manager, body: { dealId, title: 'Задача', assigneeId: 999999 } })
      assert.equal(ghost.status, 400)
      assert.match(ghost.body.error.message, /действующего сотрудника/)
    })

    it('дизайнер не может ставить задачи, но видит свою задачу в списке', async () => {
      const forbidden = await ctx.request('POST', '/tasks', { token: designer, body: { dealId, title: 'Сам себе', assigneeId: designerId } })
      assert.equal(forbidden.status, 403)

      const mine = await ctx.request('GET', '/tasks', { token: designer })
      assert.deepEqual(mine.body.items.map((task) => task.id), [taskId])
      // посторонний сотрудник чужую задачу не видит
      assert.equal((await ctx.request('GET', '/tasks', { token: marketer })).body.items.length, 0)
      assert.equal((await ctx.request('GET', `/tasks/${taskId}`, { token: marketer })).status, 404)
    })

    it('исполнитель меняет статус, но не содержание задачи', async () => {
      const status = await ctx.request('PATCH', `/tasks/${taskId}`, { token: designer, body: { status: 'in_progress' } })
      assert.equal(status.status, 200)
      assert.equal(status.body.task.status, 'in_progress')

      const title = await ctx.request('PATCH', `/tasks/${taskId}`, { token: designer, body: { title: 'Другое' } })
      assert.equal(title.status, 403)

      const unknown = await ctx.request('PATCH', `/tasks/${taskId}`, { token: designer, body: { status: 'archived' } })
      assert.equal(unknown.status, 400)

      // постановщик узнает о смене статуса
      const notifications = await ctx.request('GET', '/notifications', { token: manager })
      assert.equal(notifications.body.items[0].type, 'task_status')
    })

    it('дизайнер загружает макет; файл виден в задаче и в сделке и скачивается без искажений', async () => {
      const res = await ctx.upload(`/tasks/${taskId}/files`, { token: designer, name: 'Вывеска v1.png', content: PNG, type: 'image/png' })
      assert.equal(res.status, 201)
      assert.equal(res.body.file.name, 'Вывеска v1.png')
      assert.equal(res.body.file.mimeType, 'image/png')
      assert.equal(res.body.file.isPreviewable, true)

      // карточка сделки: задачи сделки вместе с файлами
      const dealTasks = await ctx.request('GET', `/tasks?dealId=${dealId}&scope=all`, { token: manager })
      assert.equal(dealTasks.body.items[0].files.length, 1)
      const fileId = dealTasks.body.items[0].files[0].id

      const file = await ctx.download(`/files/${fileId}`, manager)
      assert.equal(file.status, 200)
      assert.equal(file.headers.get('content-type'), 'image/png')
      assert.equal(file.headers.get('x-content-type-options'), 'nosniff')
      assert.ok(file.content.equals(PNG))

      // о новом файле узнает постановщик
      const notifications = await ctx.request('GET', '/notifications', { token: manager })
      assert.equal(notifications.body.items[0].type, 'task_file')

      // посторонний сотрудник файл не получает
      assert.equal((await ctx.download(`/files/${fileId}`, marketer)).status, 404)
    })

    it('отклоняет пустой файл и неподдерживаемый формат', async () => {
      const empty = await ctx.upload(`/tasks/${taskId}/files`, { token: designer, name: 'пусто.png', content: Buffer.alloc(0) })
      assert.equal(empty.status, 400)
      const html = await ctx.upload(`/tasks/${taskId}/files`, { token: designer, name: 'page.html', content: Buffer.from('<script>') })
      assert.equal(html.status, 400)
      assert.match(html.body.error.message, /Формат файла не поддерживается/)
      const noName = await ctx.upload(`/tasks/${taskId}/files`, { token: designer, name: '', content: PNG })
      assert.equal(noName.status, 400)
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM files')
      assert.equal(rows[0].n, 1)
    })

    it('комментарии сохраняются и уведомляют второго участника', async () => {
      const res = await ctx.request('POST', `/tasks/${taskId}/comments`, { token: manager, body: { text: 'Сделайте фон темнее' } })
      assert.equal(res.status, 201)
      const empty = await ctx.request('POST', `/tasks/${taskId}/comments`, { token: manager, body: { text: '   ' } })
      assert.equal(empty.status, 400)

      const card = await ctx.request('GET', `/tasks/${taskId}`, { token: designer })
      assert.deepEqual(card.body.comments.map((comment) => comment.text), ['Сделайте фон темнее'])
      assert.equal(card.body.canEdit, false)

      const notifications = await ctx.request('GET', '/notifications', { token: designer })
      assert.equal(notifications.body.items[0].type, 'task_comment')
      assert.match(notifications.body.items[0].body, /фон темнее/)
    })

    it('уведомления отмечаются прочитанными только у своего получателя', async () => {
      const { body } = await ctx.request('GET', '/notifications', { token: designer })
      const [first] = body.items
      assert.equal((await ctx.request('POST', `/notifications/${first.id}/read`, { token: manager })).status, 404)
      assert.equal((await ctx.request('POST', `/notifications/${first.id}/read`, { token: designer })).status, 204)
      await ctx.request('POST', '/notifications/read-all', { token: designer })
      assert.equal((await ctx.request('GET', '/notifications/unread-count', { token: designer })).body.unread, 0)
    })

    it('задача сдается на согласование и закрывается', async () => {
      await ctx.request('PATCH', `/tasks/${taskId}`, { token: designer, body: { status: 'review' } })
      const done = await ctx.request('PATCH', `/tasks/${taskId}`, { token: manager, body: { status: 'done' } })
      assert.equal(done.body.task.status, 'done')
      const open = await ctx.request('GET', '/tasks?open=1', { token: designer })
      assert.equal(open.body.items.length, 0)
    })
  })
}
