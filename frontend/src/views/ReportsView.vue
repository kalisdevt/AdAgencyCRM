<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { channelName, dateLabel, money } from '../labels.js'
import { openProtectedFile } from '../openFile.js'

// Отчеты (FR-AN-01–07): вкладки показываются по роли пользователя
const TABS = {
  channels: 'Каналы и кампании',
  refusals: 'Причины отказа',
  managers: 'KPI менеджеров',
  revenue: 'Ожидаемая выручка',
}

const route = useRoute()
const router = useRouter()

const available = ref([])
const canEditExpenses = ref(false)
const period = reactive({ from: '', to: '' })
const report = ref(null)
const loading = ref(false)
const error = ref('')

const tab = computed(() => (available.value.includes(route.query.tab) ? route.query.tab : available.value[0]))
const usesPeriod = computed(() => tab.value !== 'revenue')

const percent = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 1000) / 10}%`)
const moneyOrDash = (value) => (value === null || value === undefined ? '—' : money(value))
const minutes = (value) => {
  if (value === null || value === undefined) return '—'
  if (value < 60) return `${value} мин`
  return `${Math.floor(value / 60)} ч ${value % 60} мин`
}

function iso(date) {
  return date.toLocaleDateString('sv-SE')
}

const presets = [
  { label: 'Этот месяц', range: () => { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth(), 1), now] } },
  { label: 'Прошлый месяц', range: () => { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)] } },
  { label: 'Квартал', range: () => { const now = new Date(); const start = Math.floor(now.getMonth() / 3) * 3; return [new Date(now.getFullYear(), start, 1), now] } },
  { label: 'Год', range: () => { const now = new Date(); return [new Date(now.getFullYear(), 0, 1), now] } },
]

function applyPreset(preset) {
  const [from, to] = preset.range()
  Object.assign(period, { from: iso(from), to: iso(to) })
}

const query = () => (usesPeriod.value ? `?from=${period.from}&to=${period.to}` : '')

let request = 0
async function load() {
  if (!tab.value || !period.from || !period.to) return
  const current = ++request
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/reports/${tab.value}${query()}`)
    if (current === request) report.value = { type: tab.value, ...data }
  } catch (err) {
    if (current === request) error.value = err.message
  } finally {
    if (current === request) loading.value = false
  }
}

async function downloadCsv() {
  try {
    await openProtectedFile(`/reports/${tab.value}/csv${query()}`, { download: true, fileName: `Отчет — ${TABS[tab.value]}.csv` })
  } catch (err) {
    error.value = err.message
  }
}

// Ширина полосы в простых диаграммах
const share = (value, max) => (max > 0 ? `${Math.max(2, Math.round((value / max) * 100))}%` : '0%')
const maxOf = (rows, key) => Math.max(0, ...rows.map((row) => Number(row[key]) || 0))

// Расходы на кампании (FR-AN-02)
const campaigns = ref([])
const expenses = ref([])
const expenseForm = reactive({ campaignId: '', spentOn: iso(new Date()), amount: '', comment: '' })
const expenseError = ref('')
const expenseBusy = ref(false)

async function loadExpenses() {
  try {
    expenses.value = (await api.get(`/reports/expenses?from=${period.from}&to=${period.to}`)).items
  } catch (err) {
    expenseError.value = err.message
  }
}

async function addExpense() {
  expenseBusy.value = true
  expenseError.value = ''
  try {
    await api.post('/reports/expenses', {
      campaignId: Number(expenseForm.campaignId),
      spentOn: expenseForm.spentOn,
      amount: Number(expenseForm.amount),
      comment: expenseForm.comment || null,
    })
    Object.assign(expenseForm, { amount: '', comment: '' })
    await Promise.all([loadExpenses(), load()])
  } catch (err) {
    expenseError.value = err.message
  } finally {
    expenseBusy.value = false
  }
}

async function removeExpense(expense) {
  if (!window.confirm(`Удалить расход ${money(expense.amount)} по кампании «${expense.campaign.name}»?`)) return
  try {
    await api.delete(`/reports/expenses/${expense.id}`)
    await Promise.all([loadExpenses(), load()])
  } catch (err) {
    expenseError.value = err.message
  }
}

function selectTab(code) {
  router.replace({ query: { ...route.query, tab: code } })
}

watch([tab, () => period.from, () => period.to], () => {
  load()
  if (tab.value === 'channels' && canEditExpenses.value) loadExpenses()
})

onMounted(async () => {
  try {
    const info = await api.get('/reports')
    available.value = info.reports
    canEditExpenses.value = info.canEditExpenses
    Object.assign(period, info.period)
    if (info.canEditExpenses) {
      campaigns.value = (await api.get('/dictionaries/campaigns')).items.filter((item) => item.isActive)
    }
  } catch (err) {
    error.value = err.message
  }
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>Отчеты</h1>
        <p class="muted">Лиды периода — обращения, поступившие в выбранные даты; успешные — те из них, что уже оплачены.</p>
      </div>
      <button v-if="report" class="btn btn-ghost" type="button" @click="downloadCsv">Скачать CSV</button>
    </header>

    <nav class="tabs" aria-label="Отчеты">
      <button v-for="code in available" :key="code" class="tab" :class="{ active: tab === code }" type="button" @click="selectTab(code)">{{ TABS[code] }}</button>
    </nav>

    <div v-if="usesPeriod" class="period card">
      <label class="field"><span>С</span><input v-model="period.from" class="control" type="date" :max="period.to" /></label>
      <label class="field"><span>По</span><input v-model="period.to" class="control" type="date" :min="period.from" /></label>
      <div class="presets">
        <button v-for="preset in presets" :key="preset.label" class="btn btn-ghost btn-small" type="button" @click="applyPreset(preset)">{{ preset.label }}</button>
      </div>
    </div>
    <p v-else class="muted note">Открытые сделки на текущий момент, без учета периода. Вероятность оплаты — оценка по стадии воронки.</p>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p v-if="loading && !report" class="muted">Загрузка…</p>

    <template v-if="report && report.type === tab">
      <!-- FR-AN-01, 02 -->
      <template v-if="tab === 'channels'">
        <section class="kpis">
          <div class="kpi card"><small>Лиды</small><b>{{ report.total.leads }}</b></div>
          <div class="kpi card"><small>Успешные сделки</small><b>{{ report.total.won }}</b></div>
          <div class="kpi card"><small>Конверсия</small><b>{{ percent(report.total.conversion) }}</b></div>
          <div class="kpi card"><small>Сумма сделок</small><b>{{ money(report.total.wonAmount) }}</b></div>
          <div class="kpi card"><small>Расходы</small><b>{{ money(report.total.expenses) }}</b></div>
          <div class="kpi card"><small>Стоимость клиента</small><b>{{ moneyOrDash(report.total.costPerClient) }}</b></div>
        </section>

        <section class="card block">
          <h2>По каналам</h2>
          <p v-if="!report.channels.length" class="muted">За период обращений нет.</p>
          <div v-else class="table-wrap">
            <table>
              <thead><tr><th>Канал</th><th class="bar-col">Лиды</th><th>Успешные</th><th>Отказы</th><th>Конверсия</th><th>Сумма сделок</th></tr></thead>
              <tbody>
                <tr v-for="row in report.channels" :key="row.channel">
                  <td><span class="badge" :class="`badge-${row.channel}`">{{ channelName(row.channel) }}</span></td>
                  <td class="bar-col"><span class="bar"><i :style="{ width: share(row.leads, maxOf(report.channels, 'leads')) }"></i></span>{{ row.leads }}</td>
                  <td>{{ row.won }}</td>
                  <td>{{ row.refused }}</td>
                  <td>{{ percent(row.conversion) }}</td>
                  <td>{{ money(row.wonAmount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card block">
          <h2>По рекламным кампаниям</h2>
          <p v-if="!report.campaigns.length" class="muted">За период нет обращений с кампаниями и расходов.</p>
          <div v-else class="table-wrap">
            <table>
              <thead><tr><th>Кампания</th><th>Лиды</th><th>Успешные</th><th>Конверсия</th><th>Сумма сделок</th><th>Расходы</th><th>Цена лида</th><th>Цена клиента</th></tr></thead>
              <tbody>
                <tr v-for="row in report.campaigns" :key="row.campaignId ?? 'none'">
                  <td><b>{{ row.name }}</b><small v-if="row.code && row.code !== row.name" class="code">{{ row.code }}</small></td>
                  <td>{{ row.leads }}</td>
                  <td>{{ row.won }}</td>
                  <td>{{ percent(row.conversion) }}</td>
                  <td>{{ money(row.wonAmount) }}</td>
                  <td>{{ row.campaignId ? money(row.expenses) : '—' }}</td>
                  <td>{{ moneyOrDash(row.costPerLead) }}</td>
                  <td>{{ moneyOrDash(row.costPerClient) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="canEditExpenses" class="card block">
          <h2>Расходы на кампании за период</h2>
          <form class="expense-form" @submit.prevent="addExpense">
            <label class="field"><span>Кампания</span>
              <select v-model="expenseForm.campaignId" class="control" required>
                <option value="" disabled>Выберите</option>
                <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">{{ campaign.name }}</option>
              </select>
            </label>
            <label class="field"><span>Дата</span><input v-model="expenseForm.spentOn" class="control" type="date" required /></label>
            <label class="field"><span>Сумма, ₽</span><input v-model="expenseForm.amount" class="control" type="number" min="1" step="0.01" required /></label>
            <label class="field wide"><span>Комментарий</span><input v-model="expenseForm.comment" class="control" maxlength="500" placeholder="Например: Яндекс Директ, ноябрь" /></label>
            <button class="btn" type="submit" :disabled="expenseBusy">Добавить расход</button>
          </form>
          <p v-if="expenseError" class="notice notice-error" role="alert">{{ expenseError }}</p>
          <ul v-if="expenses.length" class="expenses">
            <li v-for="expense in expenses" :key="expense.id">
              <span><b>{{ expense.campaign.name }}</b> · {{ dateLabel(expense.spentOn) }}<template v-if="expense.comment"> · {{ expense.comment }}</template></span>
              <span class="expense-side"><b>{{ money(expense.amount) }}</b><button class="btn btn-ghost btn-small" type="button" @click="removeExpense(expense)">Удалить</button></span>
            </li>
          </ul>
          <p v-else class="muted">Расходов за период не введено.</p>
        </section>
      </template>

      <!-- FR-AN-03 -->
      <template v-if="tab === 'refusals'">
        <section class="card block">
          <h2>Причины отказа <span class="muted">· всего {{ report.total }}</span></h2>
          <p v-if="!report.reasons.length" class="muted">За период отказов нет.</p>
          <ul v-else class="bars">
            <li v-for="reason in report.reasons" :key="reason.id">
              <span class="bar-label">{{ reason.name }}</span>
              <span class="bar wide-bar"><i :style="{ width: share(reason.count, maxOf(report.reasons, 'count')) }"></i></span>
              <span class="bar-value">{{ reason.count }} · {{ percent(reason.share) }}</span>
            </li>
          </ul>
        </section>
        <section v-if="report.deals.length" class="card block">
          <h2>Сделки в «Отказе»</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Дата</th><th>Клиент</th><th>Причина</th><th>Комментарий</th><th>Ответственный</th><th>Сумма</th></tr></thead>
              <tbody>
                <tr v-for="deal in report.deals" :key="deal.id">
                  <td>{{ deal.date }}</td>
                  <td><RouterLink v-if="available.includes('managers')" :to="{ name: 'inbox', params: { dealId: deal.id } }">{{ deal.client }}</RouterLink><template v-else>{{ deal.client }}</template></td>
                  <td>{{ deal.reason }}</td>
                  <td class="comment">{{ deal.comment ?? '—' }}</td>
                  <td>{{ deal.assignee ?? '—' }}</td>
                  <td>{{ money(deal.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- FR-AN-04 -->
      <template v-if="tab === 'managers'">
        <p v-if="report.unassignedLeads" class="notice">Без ответственного за период: {{ report.unassignedLeads }} обращ. — назначьте их во «Входящих».</p>
        <section class="card block">
          <h2>KPI менеджеров</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Менеджер</th><th>Лиды</th><th>Обработано</th><th>Успешные</th><th>Отказы</th><th>Конверсия</th><th class="bar-col">Сумма сделок</th><th>Первый ответ, в среднем</th></tr></thead>
              <tbody>
                <tr v-for="row in report.managers" :key="row.id">
                  <td><b>{{ row.fullName }}</b><small class="code">{{ row.roleName }}</small></td>
                  <td>{{ row.leads }}</td>
                  <td>{{ row.processed }}</td>
                  <td>{{ row.won }}</td>
                  <td>{{ row.refused }}</td>
                  <td>{{ percent(row.conversion) }}</td>
                  <td class="bar-col"><span class="bar"><i :style="{ width: share(row.wonAmount, maxOf(report.managers, 'wonAmount')) }"></i></span>{{ money(row.wonAmount) }}</td>
                  <td>{{ minutes(row.avgResponseMinutes) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="muted hint">Переписку по любой сделке руководитель открывает во «Входящих» (FR-AN-06).</p>
        </section>
      </template>

      <!-- FR-AN-05 -->
      <template v-if="tab === 'revenue'">
        <section class="kpis">
          <div class="kpi card"><small>Открытых сделок</small><b>{{ report.total.count }}</b></div>
          <div class="kpi card"><small>Сумма открытых сделок</small><b>{{ money(report.total.amount) }}</b></div>
          <div class="kpi card"><small>С учетом вероятности</small><b>{{ money(report.total.weightedAmount) }}</b></div>
        </section>
        <section class="card block">
          <h2>По стадиям воронки</h2>
          <ul class="bars">
            <li v-for="stage in report.stages" :key="stage.code">
              <span class="bar-label">{{ stage.name }} <small class="muted">· {{ stage.count }}</small></span>
              <span class="bar wide-bar"><i :style="{ width: share(stage.amount, maxOf(report.stages, 'amount')) }"></i></span>
              <span class="bar-value">{{ money(stage.amount) }}<small class="muted"> · {{ percent(stage.probability) }} → {{ money(stage.weightedAmount) }}</small></span>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped src="../styles/reports.css"></style>
