import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { forbidden, HttpError } from '../../errors.js'
import { handleIncoming } from '../leads/intake.service.js'

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}

// Простая защита открытой формы от потока заявок с одного адреса
function rateLimit({ limit, windowMs }) {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const entry = hits.get(req.ip)
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) hits.clear()
      hits.set(req.ip, { count: 1, resetAt: now + windowMs })
      return next()
    }
    entry.count += 1
    if (entry.count > limit) {
      throw new HttpError(429, 'too_many_requests', 'Слишком много заявок. Повторите попытку через минуту.')
    }
    next()
  }
}

// Обработка одного обновления Telegram — общая для вебхука и длинного опроса
export function createTelegramUpdateHandler({ pool, channels }) {
  const telegram = channels.get('telegram')
  return async (update) => {
    const greeting = telegram.greetingFor(update)
    if (greeting && telegram.isConfigured) {
      await telegram.sendMessage(greeting.contact, greeting.text).catch((error) => console.error(`[telegram] ${error.message}`))
    }
    const event = telegram.parseIncoming(update)
    if (!event) return null
    return handleIncoming(pool, event)
  }
}

// Заявка с веб-формы сайта: открытый эндпоинт без авторизации
export function publicRoutes({ pool, channels }) {
  const router = Router()

  router.post('/leads', rateLimit({ limit: 20, windowMs: 60_000 }), async (req, res) => {
    const event = channels.get('web').parseIncoming(req.body)
    const result = await handleIncoming(pool, event)
    res.status(result.duplicate ? 200 : 201).json({
      accepted: true,
      duplicate: result.duplicate,
      message: 'Заявка принята. Менеджер свяжется с вами в ближайшее время.',
    })
  })

  return router
}

export function channelWebhookRoutes({ pool, channels, telegramWebhookSecret }) {
  const router = Router()
  const onTelegramUpdate = createTelegramUpdateHandler({ pool, channels })

  router.post('/telegram/webhook', async (req, res) => {
    const secret = telegramWebhookSecret
    // Без заданного секрета вебхук закрыт: иначе обращения мог бы подделать кто угодно
    if (!secret || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] ?? '', secret)) throw forbidden('Неверный секрет вебхука')
    const result = await onTelegramUpdate(req.body)
    res.json({ ok: true, duplicate: result?.duplicate ?? false })
  })

  return router
}
