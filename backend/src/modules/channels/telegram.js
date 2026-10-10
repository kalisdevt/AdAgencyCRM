import { HttpError } from '../../errors.js'

const API_BASE = 'https://api.telegram.org'
const NO_TEXT_PLACEHOLDER = '[Сообщение без текста: вложение]'
const GREETING = 'Здравствуйте! Напишите ваш вопрос — менеджер агентства ответит в этом чате.'

// Адаптер Telegram: переводит обновления Bot API в единый формат события
// и отправляет ответы. Остальные модули о Telegram ничего не знают.
export function createTelegramAdapter({ token, fetchImpl = fetch } = {}) {
  async function call(method, payload, { signal } = {}) {
    const response = await fetchImpl(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    const data = await response.json().catch(() => null)
    if (!data?.ok) throw new Error(data?.description || `Telegram API: HTTP ${response.status}`)
    return data.result
  }

  function isStartCommand(update) {
    return /^\/start(\s|@|$)/.test(update?.message?.text ?? '')
  }

  return {
    channel: 'telegram',
    title: 'Telegram',
    canReply: true,
    get isConfigured() {
      return Boolean(token)
    },

    // Возвращает событие в общем формате либо null, если обновление не является обращением клиента
    parseIncoming(update) {
      const message = update?.message
      if (!message?.chat || !message.from) return null
      if (message.chat.type !== 'private' || message.from.is_bot) return null
      if (isStartCommand(update)) return null

      const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim()
      return {
        channel: 'telegram',
        externalMessageId: `${message.chat.id}:${message.message_id}`,
        contact: {
          externalId: String(message.chat.id),
          username: message.from.username ?? null,
          name: name || message.from.username || `Telegram ${message.chat.id}`,
          // телефон есть, только если клиент сам поделился своим контактом
          phone: message.contact?.user_id === message.from.id ? message.contact.phone_number : null,
          email: null,
        },
        text: (message.text ?? message.caption ?? '').trim() || NO_TEXT_PLACEHOLDER,
        utm: {},
        receivedAt: message.date ? new Date(message.date * 1000) : new Date(),
      }
    },

    // Приветствие на команду /start: сама команда обращением не считается
    greetingFor(update) {
      if (!isStartCommand(update) || update.message.chat?.type !== 'private') return null
      return { contact: { externalId: String(update.message.chat.id) }, text: GREETING }
    },

    async sendMessage(contact, text) {
      if (!token) throw new HttpError(503, 'channel_unavailable', 'Telegram-бот не подключен: задайте TELEGRAM_BOT_TOKEN')
      try {
        const sent = await call('sendMessage', { chat_id: contact.externalId, text })
        return { externalMessageId: `${sent.chat.id}:${sent.message_id}` }
      } catch (error) {
        throw new HttpError(502, 'channel_error', `Не удалось отправить сообщение в Telegram: ${error.message}`)
      }
    },

    // Длинный опрос — для локального запуска без публичного адреса под вебхук
    startPolling(onUpdate) {
      const controller = new AbortController()
      let offset = 0
      const loop = async () => {
        while (!controller.signal.aborted) {
          try {
            const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, { signal: controller.signal })
            for (const update of updates) {
              offset = update.update_id + 1
              await onUpdate(update).catch((error) => console.error('[telegram] ошибка обработки обновления', error))
            }
          } catch (error) {
            if (controller.signal.aborted) return
            console.error(`[telegram] ошибка опроса: ${error.message}`)
            await new Promise((resolve) => setTimeout(resolve, 5000))
          }
        }
      }
      loop()
      return () => controller.abort()
    },
  }
}
