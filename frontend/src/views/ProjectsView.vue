<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../api.js'
import { auth } from '../auth.js'
import { fullTime, money, PROJECT_STAGES } from '../labels.js'

// Панель статусов всех проектов для руководителя (FR-PROJ-02)
const filters = reactive({ status: 'active', mine: false })
const items = ref([])
const summary = ref({})
const loading = ref(true)
const loadError = ref('')

const isManager = computed(() => auth.hasRole('manager'))

async function load() {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.mine) params.set('manager', 'me')
  try {
    const data = await api.get(`/projects?${params}`)
    items.value = data.items
    summary.value = data.summary
    loadError.value = ''
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

const totalAmount = computed(() => items.value.reduce((sum, project) => sum + Number(project.deal.amount), 0))

watch(filters, load)
onMounted(load)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>Проекты</h1>
        <p class="muted">Проект создается автоматически, когда менеджер отмечает оплату счета.</p>
      </div>
    </header>

    <section class="summary" aria-label="Проекты по этапам">
      <div v-for="stage in PROJECT_STAGES" :key="stage.code" class="stat card" :class="`stat-${stage.code}`">
        <small>{{ stage.code === 'completed' ? 'Завершено' : `Этап «${stage.name}»` }}</small>
        <b>{{ summary[stage.code] ?? 0 }}</b>
      </div>
    </section>

    <div class="filters">
      <div class="segmented" role="group" aria-label="Статус проектов">
        <button type="button" :class="{ active: filters.status === 'active' }" @click="filters.status = 'active'">В работе</button>
        <button type="button" :class="{ active: filters.status === 'completed' }" @click="filters.status = 'completed'">Завершенные</button>
        <button type="button" :class="{ active: filters.status === '' }" @click="filters.status = ''">Все</button>
      </div>
      <label v-if="isManager" class="check"><input v-model="filters.mine" type="checkbox" /><span>Только мои</span></label>
      <span v-if="items.length" class="muted total">Проектов: {{ items.length }} · на сумму {{ money(totalAmount) }}</span>
    </div>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!items.length" class="notice">Проектов с таким статусом нет.</p>

    <ul v-if="items.length" class="rows card">
      <li v-for="project in items" :key="project.id">
        <RouterLink class="row" :to="{ name: 'project', params: { id: project.id } }">
          <span class="row-main">
            <b>{{ project.title }}</b>
            <small>{{ project.client.company || project.client.name }} · {{ project.manager?.fullName ?? 'без ответственного' }}</small>
          </span>
          <span class="progress" :aria-label="`Выполнено этапов: ${project.progress.done} из ${project.progress.total}`">
            <span class="steps">
              <i v-for="stage in project.stages" :key="stage.code" :class="{ done: stage.isDone, current: !stage.isDone && stage.code === project.currentStage?.code }"></i>
            </span>
            <small>{{ project.status === 'completed' ? 'Завершен' : project.currentStage?.name }}</small>
          </span>
          <span class="row-side">
            <b>{{ money(project.deal.amount) }}</b>
            <small>{{ fullTime(project.updatedAt) }}</small>
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped src="../styles/projects.css"></style>
