<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { fullTime, shortTime } from '../labels.js'
import { notificationsState } from '../notifications.js'

const router = useRouter()
const items = ref([])
const loading = ref(true)
const loadError = ref('')

async function load() {
  try {
    const data = await api.get('/notifications')
    items.value = data.items
    notificationsState.unread = data.unread
    loadError.value = ''
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function open(item) {
  if (!item.isRead) {
    item.isRead = true
    notificationsState.unread = Math.max(0, notificationsState.unread - 1)
    api.post(`/notifications/${item.id}/read`).catch(() => {})
  }
  if (item.link) router.push(item.link)
}

async function readAll() {
  try {
    await api.post('/notifications/read-all')
    items.value.forEach((item) => { item.isRead = true })
    notificationsState.unread = 0
  } catch (error) {
    loadError.value = error.message
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>Уведомления</h1>
        <p class="muted">Новые задачи, комментарии, файлы и смена статусов.</p>
      </div>
      <button v-if="notificationsState.unread" class="btn btn-ghost btn-small" type="button" @click="readAll">Прочитать все</button>
    </header>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!items.length" class="notice">Уведомлений пока нет.</p>

    <ul v-if="items.length" class="list card">
      <li v-for="item in items" :key="item.id">
        <button class="item" :class="{ unread: !item.isRead }" type="button" @click="open(item)">
          <span class="dot" aria-hidden="true"></span>
          <span class="text">
            <b>{{ item.title }}</b>
            <small v-if="item.body">{{ item.body }}</small>
          </span>
          <time :title="fullTime(item.createdAt)">{{ shortTime(item.createdAt) }}</time>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped src="../styles/notifications.css"></style>
