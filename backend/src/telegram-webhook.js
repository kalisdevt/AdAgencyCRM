// Управление вебхуком Telegram-бота для развернутой версии (Vercel):
//
//   npm run telegram -- secret                 сгенерировать значение TELEGRAM_WEBHOOK_SECRET
//   npm run telegram -- set https://<домен>    зарегистрировать вебхук <домен>/api/channels/telegram/webhook
//   npm run telegram -- info                   состояние вебхука: адрес, очередь, последняя ошибка
//   npm run telegram -- delete                 снять вебхук (например, чтобы вернуться к опросу локально)
//
// Токен и секрет берутся из backend/.env (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET) и не выводятся.
// Секрет должен совпадать со значением в настройках сервера, иначе вебхук ответит 403.
import { randomBytes } from 'node:crypto'

const WEBHOOK_PATH = '/api/channels/telegram/webhook'
// Требование Telegram к secret_token: 1–256 символов A–Z, a–z, 0–9, «_» и «-»
const SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/

function fail(message) {
  console.error(`Ошибка: ${message}`)
  process.exit(1)
}

async function call(method, payload = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) fail('не задан TELEGRAM_BOT_TOKEN в backend/.env')
  let response
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    fail(`нет связи с Telegram: ${error.message}`)
  }
  const data = await response.json().catch(() => null)
  if (response.status === 401) fail('Telegram не принял токен — проверьте TELEGRAM_BOT_TOKEN')
  if (!data?.ok) fail(data?.description || `Telegram API: HTTP ${response.status}`)
  return data.result
}

function webhookUrl(base) {
  let url
  try {
    url = new URL(base)
  } catch {
    fail('укажите адрес сайта, например: npm run telegram -- set https://ad-agency.vercel.app')
  }
  if (url.protocol !== 'https:') fail('Telegram принимает вебхук только по HTTPS')
  return `${url.origin}${WEBHOOK_PATH}`
}

async function printInfo() {
  const [bot, info] = await Promise.all([call('getMe'), call('getWebhookInfo')])
  console.log(`Бот: @${bot.username} (${bot.first_name})`)
  console.log(`Вебхук: ${info.url || 'не задан — бот работает только в режиме опроса (TELEGRAM_POLLING=true)'}`)
  console.log(`Обновлений в очереди: ${info.pending_update_count}`)
  if (info.last_error_date) {
    const when = new Date(info.last_error_date * 1000).toLocaleString('ru-RU')
    console.log(`Последняя ошибка доставки (${when}): ${info.last_error_message}`)
    if (/403/.test(info.last_error_message)) {
      console.log('Подсказка: 403 — секрет вебхука не совпадает с TELEGRAM_WEBHOOK_SECRET на сервере (или он там не задан).')
    }
  } else if (info.url) {
    console.log('Ошибок доставки нет.')
  }
}

const [command, argument] = process.argv.slice(2)

switch (command) {
  case 'secret':
    console.log(randomBytes(32).toString('hex'))
    break

  case 'set': {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret) fail('не задан TELEGRAM_WEBHOOK_SECRET в backend/.env (сгенерируйте: npm run telegram -- secret)')
    if (!SECRET_PATTERN.test(secret)) fail('TELEGRAM_WEBHOOK_SECRET: только латиница, цифры, «_» и «-», до 256 символов')
    const url = webhookUrl(argument)
    await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'] })
    console.log(`Вебхук зарегистрирован: ${url}`)
    await printInfo()
    break
  }

  case 'info':
    await printInfo()
    break

  case 'delete':
    await call('deleteWebhook')
    console.log('Вебхук снят: теперь сообщения можно получать опросом (TELEGRAM_POLLING=true).')
    break

  default:
    console.log('Использование: npm run telegram -- secret | set https://<домен> | info | delete')
    process.exit(command ? 1 : 0)
}
