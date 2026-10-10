import { createTelegramAdapter } from './telegram.js'
import { createWebFormAdapter } from './webform.js'

// Реестр адаптеров. Чтобы подключить новый канал (например, VK), достаточно
// добавить адаптер с тем же интерфейсом и зарегистрировать его здесь:
//   { channel, title, canReply, isConfigured, parseIncoming(payload), sendMessage?(contact, text) }
export function createChannels({ telegram } = {}) {
  const adapters = [createTelegramAdapter(telegram), createWebFormAdapter()]
  const byChannel = new Map(adapters.map((adapter) => [adapter.channel, adapter]))
  return {
    get: (channel) => byChannel.get(channel) ?? null,
    list: () => adapters,
  }
}
