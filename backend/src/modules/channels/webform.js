import { z } from 'zod'
import { normalizePhone } from '../leads/contacts.js'

const optionalText = (max) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().max(max).optional())

const formSchema = z
  .object({
    name: z.string({ error: 'Укажите имя' }).trim().min(2, 'Укажите имя').max(120, 'Имя слишком длинное'),
    phone: optionalText(30),
    email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.email('Некорректный адрес почты').max(200).optional(),
    ),
    message: optionalText(2000),
    utm_source: optionalText(100),
    utm_medium: optionalText(100),
    utm_campaign: optionalText(100),
    // ключ идемпотентности: форма отправляет один и тот же ID при повторной отправке
    requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Некорректный идентификатор заявки').optional(),
  })
  .superRefine((form, ctx) => {
    if (!form.phone && !form.email) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Укажите телефон или почту для связи' })
    }
    if (form.phone && !normalizePhone(form.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Некорректный номер телефона' })
    }
  })

// Адаптер веб-формы сайта. Ответить в этот канал нельзя: у формы нет обратной связи.
export function createWebFormAdapter() {
  return {
    channel: 'web',
    title: 'Сайт',
    canReply: false,
    isConfigured: true,

    parseIncoming(body) {
      const form = formSchema.parse(body ?? {})
      return {
        channel: 'web',
        externalMessageId: form.requestId ?? null,
        contact: {
          externalId: null,
          username: null,
          name: form.name,
          phone: form.phone ?? null,
          email: form.email ?? null,
        },
        text: form.message || 'Заявка с сайта без комментария',
        utm: { source: form.utm_source, medium: form.utm_medium, campaign: form.utm_campaign },
        receivedAt: new Date(),
      }
    },
  }
}
