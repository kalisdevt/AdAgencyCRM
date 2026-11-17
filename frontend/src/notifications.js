import { reactive } from 'vue'
import { api } from './api.js'

// Счетчик непрочитанных уведомлений для меню (FR-TASK-02); обновляется опросом
export const notificationsState = reactive({ unread: 0 })

export async function refreshUnread() {
  try {
    notificationsState.unread = (await api.get('/notifications/unread-count')).unread
  } catch {
    // счетчик обновится при следующем опросе
  }
}
