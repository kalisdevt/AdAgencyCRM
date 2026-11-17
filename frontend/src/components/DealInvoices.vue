<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '../api.js'
import { fullTime, invoiceStatusName, money } from '../labels.js'
import { openProtectedFile } from '../openFile.js'

// Счета сделки: формирование PDF (FR-DOC-01), отметка оплаты (FR-DOC-02),
// отправка клиенту в Telegram (FR-DOC-03)
const props = defineProps({ deal: { type: Object, required: true } })
const emit = defineEmits(['changed'])

const invoices = ref([])
const loading = ref(true)
const error = ref('')
const info = ref('')
const busy = ref(null)
const description = ref('')
const formOpen = ref(false)

async function load() {
  try {
    invoices.value = (await api.get(`/invoices?dealId=${props.deal.id}`)).items
    error.value = ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function run(key, action) {
  busy.value = key
  error.value = ''
  info.value = ''
  try {
    await action()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = null
  }
}

const create = () =>
  run('create', async () => {
    const { invoice } = await api.post('/invoices', { dealId: props.deal.id, description: description.value || null })
    invoices.value = [invoice, ...invoices.value]
    description.value = ''
    formOpen.value = false
    info.value = `Счет № ${invoice.number} сформирован, сделка переведена в «Счет выставлен».`
    emit('changed')
  })

function markPaid(invoice) {
  if (!window.confirm(`Отметить счет № ${invoice.number} оплаченным? Сделка перейдет в «Оплачено», будет создан проект. Отменить отметку нельзя.`)) return
  run(invoice.id, async () => {
    const { invoice: updated, projectCreated } = await api.patch(`/invoices/${invoice.id}`, { status: 'paid' })
    invoices.value = invoices.value.map((item) => (item.id === updated.id ? updated : item))
    info.value = projectCreated ? 'Оплата отмечена: сделка в стадии «Оплачено», создан проект.' : 'Оплата отмечена.'
    emit('changed')
  })
}

const send = (invoice) =>
  run(`send-${invoice.id}`, async () => {
    const { invoice: updated } = await api.post(`/invoices/${invoice.id}/send`)
    invoices.value = invoices.value.map((item) => (item.id === updated.id ? updated : item))
    info.value = `Счет № ${invoice.number} отправлен клиенту в Telegram.`
    emit('changed')
  })

const openPdf = (invoice, download = false) =>
  run(`pdf-${invoice.id}`, () => openProtectedFile(`/invoices/${invoice.id}/pdf${download ? '?download=1' : ''}`, { download, fileName: `Счет ${invoice.number}.pdf` }))

watch(() => props.deal.id, () => {
  loading.value = true
  info.value = ''
  load()
})
onMounted(load)
</script>

<template>
  <div class="deal-invoices">
    <div class="toolbar">
      <h3>Счета</h3>
      <button v-if="!formOpen && deal.stage !== 'paid' && deal.stage !== 'refused'" class="btn btn-small" type="button" @click="formOpen = true">Сформировать счет</button>
    </div>

    <RouterLink v-if="deal.projectId" class="notice project-link" :to="{ name: 'project', params: { id: deal.projectId } }">
      Сделка оплачена, по ней создан проект — открыть этапы →
    </RouterLink>
    <p v-else-if="deal.stage === 'refused'" class="muted">Сделка в «Отказе»: счет выставить нельзя.</p>

    <form v-if="formOpen" class="create card" @submit.prevent="create">
      <p class="sum">Сумма счета — сумма сделки: <b>{{ money(deal.amount) }}</b></p>
      <p v-if="!(deal.amount > 0)" class="notice notice-error">Сначала укажите сумму сделки в поле «Сумма» выше.</p>
      <label class="field"><span>Наименование услуги (необязательно)</span><input v-model="description" class="control" maxlength="500" :placeholder="`Рекламные услуги: ${deal.title}`" /></label>
      <div class="actions">
        <button class="btn btn-small" type="submit" :disabled="busy === 'create' || !(deal.amount > 0)">{{ busy === 'create' ? 'Формирование…' : 'Сформировать PDF' }}</button>
        <button class="btn btn-ghost btn-small" type="button" @click="formOpen = false">Отмена</button>
      </div>
    </form>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p v-if="info" class="notice" role="status">{{ info }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!invoices.length && !formOpen" class="muted empty">Счетов по сделке еще нет. Счет формируется на сумму сделки с реквизитами агентства и клиента.</p>

    <ul class="list">
      <li v-for="invoice in invoices" :key="invoice.id" class="invoice card">
        <div class="head">
          <b>Счет № {{ invoice.number }}</b>
          <span class="badge" :class="invoice.status === 'paid' ? 'badge-accent' : 'badge-pending'">{{ invoiceStatusName(invoice.status) }}</span>
        </div>
        <p class="meta">
          {{ money(invoice.amount) }} · от {{ fullTime(invoice.issuedAt) }}
          <template v-if="invoice.paidAt"> · оплачен {{ fullTime(invoice.paidAt) }}</template>
          <template v-if="invoice.sentAt"> · отправлен в Telegram</template>
        </p>
        <p class="description">{{ invoice.description }}</p>
        <div class="actions">
          <button class="btn btn-ghost btn-small" type="button" :disabled="busy === `pdf-${invoice.id}`" @click="openPdf(invoice)">Открыть PDF</button>
          <button class="btn btn-ghost btn-small" type="button" @click="openPdf(invoice, true)">Скачать</button>
          <button v-if="deal.channel === 'telegram'" class="btn btn-ghost btn-small" type="button" :disabled="busy === `send-${invoice.id}`" @click="send(invoice)">
            {{ busy === `send-${invoice.id}` ? 'Отправка…' : invoice.sentAt ? 'Отправить снова' : 'Отправить в Telegram' }}
          </button>
          <button v-if="invoice.status === 'pending'" class="btn btn-small" type="button" :disabled="busy === invoice.id" @click="markPaid(invoice)">Отметить оплату</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped src="../styles/deal-invoices.css"></style>
