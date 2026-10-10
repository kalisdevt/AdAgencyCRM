<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { channelName, fullTime, money, shortTime, stageName } from '../labels.js'

const route = useRoute()

const card = ref(null)
const loadError = ref('')
const form = reactive({ name: '', phone: '', email: '', company: '', note: '' })
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

function fillForm(client) {
  Object.assign(form, {
    name: client.name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    company: client.company ?? '',
    note: client.note ?? '',
  })
}

async function load() {
  card.value = null
  loadError.value = ''
  try {
    card.value = await api.get(`/clients/${route.params.id}`)
    fillForm(card.value.client)
  } catch (error) {
    loadError.value = error.message
  }
}

async function save() {
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    card.value = await api.patch(`/clients/${route.params.id}`, { ...form })
    fillForm(card.value.client)
    saved.value = true
  } catch (error) {
    saveError.value = error.message
  } finally {
    saving.value = false
  }
}

function contactLabel(contact) {
  return contact.username ? `@${contact.username}` : contact.displayName || contact.externalId
}

watch(() => route.params.id, load, { immediate: true })
</script>

<template>
  <div class="page">
    <RouterLink class="back-link" :to="{ name: 'inbox' }">← Входящие</RouterLink>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="!card" class="muted">Загрузка…</p>

    <template v-else>
      <header class="page-header">
        <h1>{{ card.client.name }}</h1>
        <p class="muted">Клиент с {{ fullTime(card.client.createdAt) }}</p>
      </header>

      <div class="grid">
        <div class="column">
          <form class="card block" @submit.prevent="save">
            <h2>Контакты</h2>
            <label class="field"><span>Имя</span><input v-model.trim="form.name" class="control" required minlength="2" maxlength="120" /></label>
            <label class="field"><span>Телефон</span><input v-model.trim="form.phone" class="control" type="tel" placeholder="+7 900 000-00-00" /></label>
            <label class="field"><span>Почта</span><input v-model.trim="form.email" class="control" type="email" /></label>
            <label class="field"><span>Компания</span><input v-model.trim="form.company" class="control" maxlength="200" /></label>
            <label class="field"><span>Заметка</span><textarea v-model.trim="form.note" class="control" rows="3" maxlength="2000"></textarea></label>

            <div v-if="card.contacts.length" class="channels">
              <span v-for="contact in card.contacts" :key="contact.channel + contact.externalId" class="badge" :class="`badge-${contact.channel}`">
                {{ channelName(contact.channel) }}: {{ contactLabel(contact) }}
              </span>
            </div>

            <p v-if="saveError" class="notice notice-error" role="alert">{{ saveError }}</p>
            <p v-else-if="saved" class="notice" role="status">Изменения сохранены.</p>
            <button class="btn" type="submit" :disabled="saving">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button>
          </form>

          <section class="card block">
            <h2>Сделки</h2>
            <ul class="rows">
              <li v-for="deal in card.deals" :key="deal.id">
                <RouterLink class="row-link" :to="{ name: 'inbox', params: { dealId: deal.id } }">
                  <span class="row-main">
                    <b>{{ deal.title }}</b>
                    <small>{{ fullTime(deal.createdAt) }} · {{ deal.assignee?.fullName ?? 'Без ответственного' }}</small>
                  </span>
                  <span class="row-side">
                    <span class="badge" :class="{ 'badge-danger': deal.stage === 'refused' }">{{ stageName(deal.stage) }}</span>
                    <small>{{ money(deal.amount) }}</small>
                  </span>
                </RouterLink>
              </li>
            </ul>
          </section>

          <section class="card block">
            <h2>Проекты</h2>
            <ul v-if="card.projects.length" class="rows">
              <li v-for="project in card.projects" :key="project.id" class="row-link">
                <span class="row-main"><b>{{ project.title }}</b><small>{{ fullTime(project.createdAt) }}</small></span>
              </li>
            </ul>
            <p v-else class="muted empty">Проектов пока нет: проект создается из оплаченной сделки.</p>
          </section>
        </div>

        <section class="card block history">
          <h2>История сообщений</h2>
          <ol v-if="card.messages.length" class="timeline">
            <li v-for="message in card.messages" :key="message.id" :class="message.direction">
              <small>
                <b>{{ message.direction === 'in' ? card.client.name : (message.author?.fullName ?? 'Сотрудник') }}</b>
                · {{ channelName(message.channel) }} · <time :title="fullTime(message.createdAt)">{{ shortTime(message.createdAt) }}</time>
              </small>
              <p>{{ message.text }}</p>
            </li>
          </ol>
          <p v-else class="muted empty">Сообщений пока нет.</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped src="../styles/client.css"></style>
