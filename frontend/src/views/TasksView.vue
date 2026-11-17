<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../api.js'
import { auth, OVERSIGHT_ROLES, SALES_ROLES } from '../auth.js'
import { dateLabel, TASK_STATUSES, taskStatusName } from '../labels.js'

const seesAll = computed(() => auth.hasRole(...OVERSIGHT_ROLES))
const isSales = computed(() => auth.hasRole(...SALES_ROLES))

const filters = reactive({ scope: 'mine', status: '', open: true })
const tasks = ref([])
const loading = ref(true)
const loadError = ref('')

function query() {
  const params = new URLSearchParams({ scope: filters.scope })
  if (filters.status) params.set('status', filters.status)
  else if (filters.open) params.set('open', '1')
  return params.toString()
}

let request = 0
async function load() {
  const current = ++request
  try {
    const { items } = await api.get(`/tasks?${query()}`)
    if (current !== request) return
    tasks.value = items
    loadError.value = ''
  } catch (error) {
    if (current === request) loadError.value = error.message
  } finally {
    if (current === request) loading.value = false
  }
}

const groups = computed(() => {
  const mine = tasks.value.filter((task) => task.assignee.id === auth.user.id)
  const others = tasks.value.filter((task) => task.assignee.id !== auth.user.id)
  return [
    { key: 'mine', title: 'Мне поручено', items: mine },
    { key: 'others', title: filters.scope === 'all' ? 'Задачи сотрудников' : 'Поставлено мной', items: others },
  ].filter((group) => group.items.length)
})

watch(filters, () => {
  loading.value = true
  load()
})

let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => !document.hidden && load(), 20_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>Задачи</h1>
        <p class="muted">
          <template v-if="isSales">Задачи ставятся из карточки сделки во «Входящих».</template>
          <template v-else>Задачи, которые вам поставили менеджеры: макеты, тексты, согласования.</template>
        </p>
      </div>
    </header>

    <div class="filters">
      <div v-if="seesAll" class="segmented" role="group" aria-label="Чьи задачи">
        <button type="button" :class="{ active: filters.scope === 'mine' }" @click="filters.scope = 'mine'">Мои</button>
        <button type="button" :class="{ active: filters.scope === 'all' }" @click="filters.scope = 'all'">Все</button>
      </div>
      <select v-model="filters.status" class="control" aria-label="Статус">
        <option value="">Все статусы</option>
        <option v-for="status in TASK_STATUSES" :key="status.code" :value="status.code">{{ status.name }}</option>
      </select>
      <label v-if="!filters.status" class="check">
        <input v-model="filters.open" type="checkbox" />
        <span>Только незавершенные</span>
      </label>
    </div>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!tasks.length" class="notice">Задач нет. Новые задачи появятся здесь, а в разделе «Уведомления» придет оповещение.</p>

    <section v-for="group in groups" :key="group.key" class="group">
      <h2>{{ group.title }} <span class="muted">{{ group.items.length }}</span></h2>
      <ul class="rows card">
        <li v-for="task in group.items" :key="task.id">
          <RouterLink class="row" :to="{ name: 'task', params: { id: task.id } }">
            <span class="row-main">
              <b>{{ task.title }}</b>
              <small>{{ task.client.name }} · {{ task.deal.title }}</small>
            </span>
            <span class="row-people">
              <small>Исполнитель: {{ task.assignee.fullName }}</small>
              <small>Поставил(а): {{ task.author.fullName }}</small>
            </span>
            <span class="row-side">
              <span class="badge" :class="`status-${task.status}`">{{ taskStatusName(task.status) }}</span>
              <small v-if="task.dueDate" :class="{ overdue: task.isOverdue }">до {{ dateLabel(task.dueDate) }}</small>
              <small v-if="task.files.length || task.commentCount" class="counters">
                <template v-if="task.files.length">файлов: {{ task.files.length }}</template>
                <template v-if="task.files.length && task.commentCount"> · </template>
                <template v-if="task.commentCount">комм.: {{ task.commentCount }}</template>
              </small>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped src="../styles/tasks.css"></style>
