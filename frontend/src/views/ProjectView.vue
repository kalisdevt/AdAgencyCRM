<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { auth, SALES_ROLES } from '../auth.js'
import { channelName, fullTime, invoiceStatusName, money } from '../labels.js'
import { openProtectedFile } from '../openFile.js'

const route = useRoute()
const card = ref(null)
const loadError = ref('')
const actionError = ref('')
const info = ref('')
const busy = ref('')
const notifyClient = ref(true)

const project = computed(() => card.value?.project)
const isSales = computed(() => auth.hasRole(...SALES_ROLES))
const nextStage = computed(() => project.value?.stages.find((stage) => !stage.isDone) ?? null)
const lastDone = computed(() => [...(project.value?.stages ?? [])].reverse().find((stage) => stage.isDone) ?? null)
const canNotify = computed(() => project.value?.deal.channel === 'telegram')

async function load() {
  loadError.value = ''
  try {
    card.value = await api.get(`/projects/${route.params.id}`)
  } catch (error) {
    loadError.value = error.message
  }
}

async function mark(stage, done) {
  busy.value = stage.code
  actionError.value = ''
  info.value = ''
  try {
    const result = await api.post(`/projects/${project.value.id}/stages/${stage.code}`, {
      done,
      notifyClient: done && canNotify.value && notifyClient.value,
    })
    card.value.project = result.project
    if (result.clientNotification?.sent) info.value = `Клиент получил уведомление в ${channelName(project.value.deal.channel)}.`
    else if (result.clientNotification) info.value = `Этап отмечен, но уведомить клиента не удалось: ${result.clientNotification.reason}`
  } catch (error) {
    actionError.value = error.message
  } finally {
    busy.value = ''
  }
}

async function openPdf(invoice) {
  try {
    await openProtectedFile(`/invoices/${invoice.id}/pdf`)
  } catch (error) {
    actionError.value = error.message
  }
}

watch(() => route.params.id, load, { immediate: true })
</script>

<template>
  <div class="page">
    <RouterLink class="back-link" :to="{ name: 'projects' }">← Проекты</RouterLink>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="!card" class="muted">Загрузка…</p>

    <template v-else>
      <header class="page-header">
        <div>
          <h1>{{ project.title }}</h1>
          <p class="muted">
            <RouterLink v-if="isSales" :to="{ name: 'client', params: { id: project.client.id } }">{{ project.client.company || project.client.name }}</RouterLink>
            <template v-else>{{ project.client.company || project.client.name }}</template>
            · ответственный: {{ project.manager?.fullName ?? 'не назначен' }} · {{ money(project.deal.amount) }}
          </p>
        </div>
        <span class="badge" :class="project.status === 'completed' ? 'badge-accent' : 'badge-active'">
          {{ project.status === 'completed' ? 'Завершен' : `Этап: ${project.currentStage?.name}` }}
        </span>
      </header>

      <p v-if="actionError" class="notice notice-error" role="alert">{{ actionError }}</p>
      <p v-if="info" class="notice" role="status">{{ info }}</p>

      <div class="grid">
        <section class="card block">
          <h2>Этапы выполнения</h2>
          <ol class="stages">
            <li v-for="(stage, index) in project.stages" :key="stage.code" class="stage" :class="{ done: stage.isDone, current: stage.code === nextStage?.code }">
              <span class="marker" aria-hidden="true">{{ stage.isDone ? '✓' : index + 1 }}</span>
              <span class="stage-text">
                <b>{{ stage.name }}</b>
                <small v-if="stage.isDone">{{ stage.doneBy?.fullName }} · {{ fullTime(stage.doneAt) }}</small>
                <small v-else-if="stage.code === nextStage?.code">Текущий этап</small>
                <small v-else>Ожидает</small>
              </span>
              <template v-if="card.canMarkStages">
                <button v-if="stage.code === nextStage?.code" class="btn btn-small" type="button" :disabled="Boolean(busy)" @click="mark(stage, true)">
                  {{ busy === stage.code ? 'Сохранение…' : 'Выполнен' }}
                </button>
                <button v-else-if="stage.code === lastDone?.code" class="btn btn-ghost btn-small" type="button" :disabled="Boolean(busy)" @click="mark(stage, false)">Отменить</button>
              </template>
            </li>
          </ol>
          <label v-if="card.canMarkStages && canNotify && nextStage" class="check">
            <input v-model="notifyClient" type="checkbox" />
            <span>Сообщать клиенту в Telegram о выполнении этапа</span>
          </label>
          <p v-if="!card.canMarkStages" class="muted hint">Этапы отмечает ответственный менеджер проекта или руководитель отдела продаж.</p>
        </section>

        <section class="card block">
          <h2>Сделка и счета</h2>
          <RouterLink v-if="isSales" class="btn btn-ghost btn-small" :to="{ name: 'inbox', params: { dealId: project.deal.id } }">Открыть сделку и переписку</RouterLink>
          <ul class="rows">
            <li v-for="invoice in card.invoices" :key="invoice.id" class="row">
              <span class="row-main">
                <b>Счет № {{ invoice.number }}</b>
                <small>{{ money(invoice.amount) }} · {{ invoiceStatusName(invoice.status) }}{{ invoice.paidAt ? ` ${fullTime(invoice.paidAt)}` : '' }}</small>
              </span>
              <button class="btn btn-ghost btn-small" type="button" @click="openPdf(invoice)">PDF</button>
            </li>
          </ul>
          <dl class="facts">
            <div><dt>Создан</dt><dd>{{ fullTime(project.createdAt) }}</dd></div>
            <div v-if="project.completedAt"><dt>Завершен</dt><dd>{{ fullTime(project.completedAt) }}</dd></div>
            <div><dt>Канал обращения</dt><dd>{{ channelName(project.deal.channel) }}</dd></div>
          </dl>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped src="../styles/project.css"></style>
