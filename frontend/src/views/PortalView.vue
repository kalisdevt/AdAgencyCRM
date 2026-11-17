<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api.js'
import { dateLabel, fullTime, invoiceStatusName, money } from '../labels.js'
import { openProtectedFile } from '../openFile.js'

// Личный кабинет клиента (FR-PORT-01, 02): текущие заказы и архив проектов
const data = ref(null)
const loadError = ref('')
const fileError = ref('')

async function load() {
  try {
    data.value = await api.get('/portal')
    loadError.value = ''
  } catch (error) {
    loadError.value = error.message
  }
}

async function openInvoice(invoice) {
  fileError.value = ''
  try {
    await openProtectedFile(`/portal/invoices/${invoice.id}/pdf`)
  } catch (error) {
    fileError.value = error.message
  }
}

const shortDate = (value) => dateLabel(new Date(value).toLocaleDateString('sv-SE'))

onMounted(load)
</script>

<template>
  <div class="page">
    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="!data" class="muted">Загрузка…</p>

    <template v-else>
      <header class="page-header">
        <p class="kicker">Личный кабинет</p>
        <h1>{{ data.client?.company || data.client?.name }}</h1>
        <p class="muted">Статусы ваших заказов обновляются, как только менеджер отмечает выполнение этапа.</p>
      </header>

      <section class="section">
        <h2>Текущие заказы</h2>
        <p v-if="!data.activeProjects.length && !data.orders.length" class="notice">Сейчас заказов в работе нет.</p>

        <article v-for="project in data.activeProjects" :key="project.id" class="project card">
          <div class="project-head">
            <div>
              <h3>{{ project.title }}</h3>
              <p class="muted">Заказ от {{ shortDate(project.createdAt) }} · {{ money(project.amount) }}<template v-if="project.manager"> · менеджер: {{ project.manager.fullName }}</template></p>
            </div>
            <span class="badge badge-current">Сейчас: {{ project.currentStage?.name }}</span>
          </div>
          <ol class="track" :aria-label="`Выполнено этапов: ${project.progress.done} из ${project.progress.total}`">
            <li v-for="stage in project.stages" :key="stage.code" :class="{ done: stage.isDone, current: stage.code === project.currentStage?.code }">
              <span class="dot" aria-hidden="true">{{ stage.isDone ? '✓' : '' }}</span>
              <b>{{ stage.name }}</b>
              <small v-if="stage.isDone">{{ shortDate(stage.doneAt) }}</small>
              <small v-else-if="stage.code === project.currentStage?.code">в работе</small>
            </li>
          </ol>
        </article>

        <ul v-if="data.orders.length" class="orders card">
          <li v-for="order in data.orders" :key="order.id">
            <span class="order-main">
              <b>{{ order.title }}</b>
              <small>Заявка от {{ shortDate(order.createdAt) }}<template v-if="order.amount > 0"> · {{ money(order.amount) }}</template></small>
            </span>
            <span class="badge">{{ order.status }}</span>
          </li>
        </ul>
      </section>

      <section v-if="data.invoices.length" class="section">
        <h2>Счета</h2>
        <p v-if="fileError" class="notice notice-error" role="alert">{{ fileError }}</p>
        <ul class="orders card">
          <li v-for="invoice in data.invoices" :key="invoice.id">
            <span class="order-main">
              <b>Счет № {{ invoice.number }}</b>
              <small>{{ money(invoice.amount) }} · {{ fullTime(invoice.issuedAt) }}</small>
            </span>
            <span class="badge" :class="invoice.status === 'paid' ? 'badge-accent' : 'badge-current'">{{ invoiceStatusName(invoice.status) }}</span>
            <button class="btn btn-ghost btn-small" type="button" @click="openInvoice(invoice)">PDF</button>
          </li>
        </ul>
      </section>

      <section class="section">
        <h2>Архив проектов</h2>
        <p v-if="!data.archive.length" class="muted">Завершенных проектов пока нет.</p>
        <ul v-else class="orders card">
          <li v-for="project in data.archive" :key="project.id">
            <span class="order-main">
              <b>{{ project.title }}</b>
              <small>{{ shortDate(project.createdAt) }} — {{ shortDate(project.completedAt) }} · {{ money(project.amount) }}</small>
            </span>
            <span class="badge badge-accent">Завершен</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped src="../styles/portal.css"></style>
