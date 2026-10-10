import { reactive } from 'vue'
import { api, setToken, setUnauthorizedHandler } from './api.js'

const STORAGE_KEY = 'crm.token'
// Роли, которым доступны обращения, сделки и карточки клиентов
export const SALES_ROLES = ['admin', 'manager', 'sales_head']

function readStoredToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeToken(token, remember) {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    // «Запомнить меня» — токен переживает закрытие браузера, иначе живет до закрытия вкладки
    if (token) (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, token)
  } catch {
    // хранилище недоступно (приватный режим): сессия проживет до перезагрузки страницы
  }
}

const state = reactive({ user: null })
let restoring = null

export const auth = {
  state,

  get user() {
    return state.user
  },

  // Восстанавливает сессию по сохраненному токену; выполняется один раз при первом переходе
  restore() {
    restoring ??= (async () => {
      const token = readStoredToken()
      if (!token) return
      setToken(token)
      try {
        state.user = (await api.get('/auth/me')).user
      } catch {
        setToken(null)
      }
    })()
    return restoring
  },

  async login(login, password, remember) {
    const { token, user } = await api.post('/auth/login', { login, password })
    setToken(token)
    storeToken(token, remember)
    state.user = user
    return user
  },

  logout() {
    setToken(null)
    storeToken(null)
    state.user = null
  },

  hasRole(...roles) {
    return Boolean(state.user) && roles.includes(state.user.role)
  },
}

export function homeRouteFor(user) {
  if (SALES_ROLES.includes(user.role)) return { name: 'inbox' }
  return { name: 'home' }
}

export function onSessionExpired(handler) {
  setUnauthorizedHandler(() => {
    if (!state.user) return
    auth.logout()
    handler()
  })
}
