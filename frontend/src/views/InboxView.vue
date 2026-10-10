<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { CHANNELS, STAGES, channelName, fullTime, shortTime, stageName } from '../labels.js'

// Новые обращения должны появляться в ленте не позже чем через 10 секунд (приемочный сценарий ТЗ)
const REFRESH_MS = 5000

const route = useRoute()
const router = useRouter()

const filters = reactive({ channel: '', stage: '', assignee: '', unread: false })
const items = ref([])
const unreadTotal = ref(0)
const listError = ref('')
const loadingList = ref(true)

const managers = ref([])
const refusalReasons = ref([])

const selectedId = computed(() => (route.params.dealId ? Number(route.params.dealId) : null))
const detail = ref(null)
const detailError = ref('')
const actionError = ref('')
const saving = ref(false)

const replyText = ref('')
const sending = ref(false)
const thread = ref(null)

// Форма отказа открывается прямо в панели диалога, без перехода на другую страницу
const refusal = reactive({ open: false, reasonId: '', comment: '' })

function inboxQuery() {
  const params = new URLSearchParams()
  if (filters.channel) params.set('channel', filters.channel)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.unread) params.set('unread', '1')
  const query = params.toString()
  return query ? `?${query}` : ''
}

// Ответ на устаревший запрос (фильтр уже сменили) не должен перезаписать свежие данные
let listRequest = 0
async function loadList() {
  const current = ++listRequest
  try {
    const data = await api.get(`/inbox${inboxQuery()}`)
    if (current !== listRequest) return
    items.value = data.items
    unreadTotal.value = data.unreadTotal
    listError.value = ''
  } catch (error) {
    if (current === listRequest) listError.value = error.message
  } finally {
    if (current === listRequest) loadingList.value = false
  }
}

let detailRequest = 0
async function loadDetail({ silent = false } = {}) {
  const id = selectedId.value
  const current = ++detailRequest
  if (!id) {
    detail.value = null
    return
  }
  if (!silent) {
    detail.value = null
    detailError.value = ''
  }
  try {
    const data = await api.get(`/deals/${id}`)
    if (current !== detailRequest) return
    const previousCount = detail.value?.messages.length ?? 0
    detail.value = data
    detailError.value = ''
    if (data.deal.unread > 0) markRead(id)
    if (data.messages.length !== previousCount) scrollThreadToEnd()
  } catch (error) {
    if (current === detailRequest && !silent) detailError.value = error.message
  }
}

async function markRead(id) {
  try {
    await api.post(`/deals/${id}/read`)
    const item = items.value.find((entry) => entry.id === id)
    if (item?.unread) {
      item.unread = 0
      unreadTotal.value = Math.max(0, unreadTotal.value - 1)
    }
  } catch {
    // отметка повторится при следующем обновлении ленты
  }
}

async function scrollThreadToEnd() {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
}

function applyDeal(deal) {
  if (detail.value?.deal.id === deal.id) detail.value.deal = deal
  loadList()
}

async function patchDeal(changes) {
  saving.value = true
  actionError.value = ''
  try {
    const { deal } = await api.patch(`/deals/${selectedId.value}`, changes)
    applyDeal(deal)
    return true
  } catch (error) {
    actionError.value = error.message
    return false
  } finally {
    saving.value = false
  }
}

function onStageChange(event) {
  const stage = event.target.value
  if (stage === 'refused') {
    // Отказ требует причины: возвращаем список к текущей стадии, пока причина не выбрана
    event.target.value = detail.value.deal.stage
    Object.assign(refusal, { open: true, reasonId: '', comment: '' })
    actionError.value = ''
    return
  }
  refusal.open = false
  patchDeal({ stage }).then((ok) => {
    if (!ok) event.target.value = detail.value.deal.stage
  })
}

async function confirmRefusal() {
  const ok = await patchDeal({
    stage: 'refused',
    refusalReasonId: Number(refusal.reasonId),
    refusalComment: refusal.comment.trim() || null,
  })
  if (ok) refusal.open = false
}

function onAssigneeChange(event) {
  const value = event.target.value
  patchDeal({ assigneeId: value ? Number(value) : null }).then((ok) => {
    if (!ok) event.target.value = detail.value.deal.assignee?.id ?? ''
  })
}

function onAmountChange(event) {
  const amount = Number(event.target.value)
  if (event.target.value === '' || Number.isNaN(amount)) {
    event.target.value = detail.value.deal.amount
    return
  }
  patchDeal({ amount }).then((ok) => {
    if (!ok) event.target.value = detail.value.deal.amount
  })
}

async function sendReply() {
  const text = replyText.value.trim()
  if (!text || sending.value) return
  sending.value = true
  actionError.value = ''
  try {
    const { message } = await api.post(`/deals/${selectedId.value}/messages`, { text })
    detail.value.messages.push(message)
    replyText.value = ''
    scrollThreadToEnd()
    loadDetail({ silent: true })
    loadList()
  } catch (error) {
    actionError.value = error.message
  } finally {
    sending.value = false
  }
}

function openDeal(id) {
  router.push({ name: 'inbox', params: { dealId: id } })
}

function resetFilters() {
  Object.assign(filters, { channel: '', stage: '', assignee: '', unread: false })
}

const hasFilters = computed(() => Boolean(filters.channel || filters.stage || filters.assignee || filters.unread))

watch(filters, () => {
  loadingList.value = true
  loadList()
})

watch(selectedId, () => {
  refusal.open = false
  actionError.value = ''
  replyText.value = ''
  loadDetail()
})

let timer = null
function refresh() {
  if (document.hidden) return
  loadList()
  // Пока менеджер выбирает причину отказа или сохраняет изменение, панель не перерисовываем
  if (selectedId.value && !saving.value && !refusal.open) loadDetail({ silent: true })
}

onMounted(async () => {
  loadList()
  loadDetail()
  timer = setInterval(refresh, REFRESH_MS)
  document.addEventListener('visibilitychange', refresh)
  const [staff, reasons] = await Promise.allSettled([api.get('/users/assignable'), api.get('/deals/refusal-reasons')])
  if (staff.status === 'fulfilled') managers.value = staff.value.items
  if (reasons.status === 'fulfilled') refusalReasons.value = reasons.value.items
})

onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', refresh)
})
</script>

<template>
  <div class="inbox" :class="{ 'has-selection': selectedId }">
    <section class="list-pane" aria-label="Лента обращений">
      <header class="list-header">
        <h1>Входящие</h1>
        <span v-if="unreadTotal" class="badge badge-accent">{{ unreadTotal }} непрочит.</span>
      </header>

      <div class="filters">
        <select v-model="filters.channel" class="control" aria-label="Канал">
          <option value="">Все каналы</option>
          <option v-for="channel in CHANNELS" :key="channel.code" :value="channel.code">{{ channel.name }}</option>
        </select>
        <select v-model="filters.stage" class="control" aria-label="Статус">
          <option value="">Все статусы</option>
          <option v-for="stage in STAGES" :key="stage.code" :value="stage.code">{{ stage.name }}</option>
        </select>
        <select v-model="filters.assignee" class="control" aria-label="Ответственный">
          <option value="">Все ответственные</option>
          <option value="me">Мои</option>
          <option value="none">Без ответственного</option>
          <option v-for="manager in managers" :key="manager.id" :value="String(manager.id)">{{ manager.fullName }}</option>
        </select>
        <label class="unread-toggle">
          <input v-model="filters.unread" type="checkbox" />
          <span>Только непрочитанные</span>
        </label>
      </div>

      <p v-if="listError" class="notice notice-error list-note" role="alert">{{ listError }}</p>

      <ul v-if="items.length" class="deal-list">
        <li v-for="item in items" :key="item.id">
          <button class="deal" :class="{ active: item.id === selectedId, unread: item.unread > 0 }" type="button" @click="openDeal(item.id)">
            <span class="deal-top">
              <b class="deal-name">{{ item.client.name }}</b>
              <time class="deal-time">{{ shortTime(item.lastMessage?.createdAt ?? item.createdAt) }}</time>
            </span>
            <span class="deal-text">
              <template v-if="item.lastMessage?.direction === 'out'">Ответ: </template>{{ item.lastMessage?.text ?? 'Сообщений пока нет' }}
            </span>
            <span class="deal-meta">
              <span class="badge" :class="`badge-${item.channel}`">{{ channelName(item.channel) }}</span>
              <span class="badge" :class="{ 'badge-danger': item.stage === 'refused' }">{{ stageName(item.stage) }}</span>
              <span class="deal-assignee">{{ item.assignee?.fullName ?? 'Не назначен' }}</span>
              <span v-if="item.unread" class="unread-count" :aria-label="`Непрочитанных: ${item.unread}`">{{ item.unread }}</span>
            </span>
          </button>
        </li>
      </ul>
      <div v-else-if="!loadingList && !listError" class="empty">
        <template v-if="hasFilters">
          <p>По выбранным фильтрам обращений нет.</p>
          <button class="btn btn-ghost btn-small" type="button" @click="resetFilters">Сбросить фильтры</button>
        </template>
        <p v-else>Обращений пока нет. Сообщение Telegram-боту или заявка с формы сайта появятся здесь автоматически.</p>
      </div>
    </section>

    <section class="detail-pane" aria-label="Диалог с клиентом">
      <div v-if="!selectedId" class="placeholder">
        <p>Выберите обращение слева, чтобы открыть переписку.</p>
      </div>
      <div v-else-if="detailError" class="placeholder">
        <p class="notice notice-error" role="alert">{{ detailError }}</p>
        <RouterLink class="btn btn-ghost btn-small" :to="{ name: 'inbox' }">К списку</RouterLink>
      </div>
      <div v-else-if="!detail" class="placeholder"><p class="muted">Загрузка…</p></div>

      <template v-else>
        <header class="detail-header">
          <RouterLink class="back" :to="{ name: 'inbox' }" aria-label="К списку обращений">←</RouterLink>
          <div class="detail-title">
            <h2>
              <RouterLink :to="{ name: 'client', params: { id: detail.deal.client.id } }">{{ detail.deal.client.name }}</RouterLink>
            </h2>
            <p>
              <span class="badge" :class="`badge-${detail.deal.channel}`">{{ channelName(detail.deal.channel) }}</span>
              <span v-if="detail.deal.client.isReturning" class="badge badge-accent">Повторный клиент</span>
              <span v-if="detail.deal.client.phone">{{ detail.deal.client.phone }}</span>
              <span v-if="detail.deal.client.email">{{ detail.deal.client.email }}</span>
              <span v-if="detail.deal.utm.campaign">Кампания: {{ detail.deal.utm.campaign }}</span>
            </p>
          </div>
          <RouterLink class="btn btn-ghost btn-small" :to="{ name: 'client', params: { id: detail.deal.client.id } }">Карточка клиента</RouterLink>
        </header>

        <div class="deal-controls">
          <label class="field">
            <span>Стадия сделки</span>
            <select class="control" :value="detail.deal.stage" :disabled="saving" @change="onStageChange">
              <option v-for="stage in STAGES" :key="stage.code" :value="stage.code">{{ stage.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Ответственный</span>
            <select class="control" :value="detail.deal.assignee?.id ?? ''" :disabled="saving" @change="onAssigneeChange">
              <option value="">Не назначен</option>
              <option v-for="manager in managers" :key="manager.id" :value="manager.id">{{ manager.fullName }}</option>
            </select>
          </label>
          <label class="field amount">
            <span>Сумма, ₽</span>
            <input class="control" type="number" min="0" step="100" inputmode="numeric" :value="detail.deal.amount" :disabled="saving" @change="onAmountChange" />
          </label>
        </div>

        <p v-if="detail.deal.stage === 'refused'" class="refusal-info">
          Причина отказа: <b>{{ detail.deal.refusalReason }}</b><template v-if="detail.deal.refusalComment"> — {{ detail.deal.refusalComment }}</template>
        </p>

        <form v-if="refusal.open" class="refusal-form" @submit.prevent="confirmRefusal">
          <label class="field">
            <span>Причина отказа</span>
            <select v-model="refusal.reasonId" class="control" required>
              <option value="" disabled>Выберите причину</option>
              <option v-for="reason in refusalReasons" :key="reason.id" :value="reason.id">{{ reason.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Комментарий (необязательно)</span>
            <input v-model="refusal.comment" class="control" maxlength="1000" />
          </label>
          <div class="refusal-actions">
            <button class="btn btn-danger btn-small" type="submit" :disabled="!refusal.reasonId || saving">Перевести в «Отказ»</button>
            <button class="btn btn-ghost btn-small" type="button" @click="refusal.open = false">Отмена</button>
          </div>
        </form>

        <p v-if="actionError" class="notice notice-error action-error" role="alert">{{ actionError }}</p>

        <div ref="thread" class="thread">
          <div v-for="message in detail.messages" :key="message.id" class="bubble-row" :class="message.direction">
            <div class="bubble">
              <p>{{ message.text }}</p>
              <small :title="fullTime(message.createdAt)">
                <template v-if="message.direction === 'out'">{{ message.author?.fullName ?? 'Сотрудник' }} · </template>{{ shortTime(message.createdAt) }}
              </small>
            </div>
          </div>
        </div>

        <form class="reply" @submit.prevent="sendReply">
          <p v-if="detail.replyUnavailableReason" class="reply-blocked">{{ detail.replyUnavailableReason }}</p>
          <template v-else>
            <textarea
              v-model="replyText"
              class="control"
              rows="2"
              maxlength="4000"
              :placeholder="`Ответ клиенту в ${channelName(detail.deal.channel)}`"
              aria-label="Текст ответа"
              @keydown.enter.exact.prevent="sendReply"
            ></textarea>
            <button class="btn" type="submit" :disabled="sending || !replyText.trim()">{{ sending ? 'Отправка…' : 'Отправить' }}</button>
          </template>
        </form>
      </template>
    </section>
  </div>
</template>

<style scoped src="../styles/inbox.css"></style>
