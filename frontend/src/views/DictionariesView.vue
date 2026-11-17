<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../api.js'
import { auth } from '../auth.js'

// Справочники (FR-ADM-02): причины отказа — администратор, рекламные кампании — администратор и маркетолог
const isAdmin = computed(() => auth.hasRole('admin'))

const reasons = ref([])
const campaigns = ref([])
const error = ref('')
const busy = ref(false)
const reasonName = ref('')
const campaign = reactive({ code: '', name: '' })

async function load() {
  try {
    const [campaignList, reasonList] = await Promise.all([
      api.get('/dictionaries/campaigns'),
      isAdmin.value ? api.get('/dictionaries/refusal-reasons') : Promise.resolve({ items: [] }),
    ])
    campaigns.value = campaignList.items
    reasons.value = reasonList.items
  } catch (err) {
    error.value = err.message
  }
}

async function run(action) {
  busy.value = true
  error.value = ''
  try {
    await action()
    await load()
    return true
  } catch (err) {
    error.value = err.message
    return false
  } finally {
    busy.value = false
  }
}

async function addReason() {
  if (await run(() => api.post('/dictionaries/refusal-reasons', { name: reasonName.value }))) reasonName.value = ''
}

async function addCampaign() {
  if (await run(() => api.post('/dictionaries/campaigns', { ...campaign }))) Object.assign(campaign, { code: '', name: '' })
}

function rename(kind, item) {
  const name = window.prompt('Новое название', item.name)?.trim()
  if (!name || name === item.name) return
  run(() => api.patch(`/dictionaries/${kind}/${item.id}`, { name }))
}

const toggle = (kind, item) => run(() => api.patch(`/dictionaries/${kind}/${item.id}`, { isActive: !item.isActive }))

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>Справочники</h1>
      <p class="muted">Скрытые записи не предлагаются при выборе, но сохраняются в старых сделках и отчетах.</p>
    </header>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <div class="grid">
      <section class="card block">
        <h2>Рекламные кампании</h2>
        <p class="muted small">Кампания из метки utm_campaign веб-формы создается автоматически; здесь можно завести ее заранее и дать понятное название.</p>
        <form class="add" @submit.prevent="addCampaign">
          <input v-model.trim="campaign.code" class="control" required pattern="[A-Za-z0-9._\-]{2,100}" placeholder="Код (utm_campaign)" aria-label="Код кампании" title="Латиница, цифры, точка, дефис, подчеркивание" />
          <input v-model.trim="campaign.name" class="control" required minlength="2" maxlength="120" placeholder="Название" aria-label="Название кампании" />
          <button class="btn" type="submit" :disabled="busy">Добавить</button>
        </form>
        <ul class="items">
          <li v-for="item in campaigns" :key="item.id" :class="{ inactive: !item.isActive }">
            <span class="item-main"><b>{{ item.name }}</b><small>{{ item.code }}<template v-if="!item.isActive"> · скрыта</template></small></span>
            <button class="btn btn-ghost btn-small" type="button" @click="rename('campaigns', item)">Переименовать</button>
            <button class="btn btn-ghost btn-small" type="button" @click="toggle('campaigns', item)">{{ item.isActive ? 'Скрыть' : 'Вернуть' }}</button>
          </li>
        </ul>
      </section>

      <section v-if="isAdmin" class="card block">
        <h2>Причины отказа</h2>
        <form class="add" @submit.prevent="addReason">
          <input v-model.trim="reasonName" class="control" required minlength="2" maxlength="120" placeholder="Новая причина" aria-label="Новая причина отказа" />
          <button class="btn" type="submit" :disabled="busy">Добавить</button>
        </form>
        <ul class="items">
          <li v-for="item in reasons" :key="item.id" :class="{ inactive: !item.isActive }">
            <span class="item-main"><b>{{ item.name }}</b><small v-if="!item.isActive">скрыта</small></span>
            <button class="btn btn-ghost btn-small" type="button" @click="rename('refusal-reasons', item)">Переименовать</button>
            <button class="btn btn-ghost btn-small" type="button" @click="toggle('refusal-reasons', item)">{{ item.isActive ? 'Скрыть' : 'Вернуть' }}</button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped src="../styles/dictionaries.css"></style>
