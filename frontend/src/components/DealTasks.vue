<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../api.js'
import { dateLabel, FILE_ACCEPT, taskStatusName } from '../labels.js'
import FileList from './FileList.vue'

// Задачи сделки и постановка новой задачи прямо из карточки сделки (FR-TASK-01).
// Здесь же менеджер видит загруженные исполнителем макеты (FR-TASK-03).
const props = defineProps({ dealId: { type: Number, required: true } })
const emit = defineEmits(['count'])

const tasks = ref([])
const loading = ref(true)
const loadError = ref('')
const staff = ref([])

const emptyForm = () => ({ title: '', assigneeId: '', dueDate: '', description: '' })
const form = reactive(emptyForm())
const attachments = ref([])
const fileInput = ref(null)
const formOpen = ref(false)
const creating = ref(false)
const formError = ref('')

let request = 0
async function load({ silent = false } = {}) {
  const current = ++request
  if (!silent) loading.value = true
  try {
    const { items } = await api.get(`/tasks?dealId=${props.dealId}&scope=all`)
    if (current !== request) return
    tasks.value = items
    loadError.value = ''
    emit('count', items.filter((task) => task.status !== 'done').length)
  } catch (error) {
    if (current === request) loadError.value = error.message
  } finally {
    if (current === request) loading.value = false
  }
}

function onFiles(event) {
  attachments.value = [...event.target.files]
}

async function create() {
  creating.value = true
  formError.value = ''
  try {
    const { task } = await api.post('/tasks', {
      dealId: props.dealId,
      title: form.title,
      assigneeId: Number(form.assigneeId),
      dueDate: form.dueDate || null,
      description: form.description || null,
    })
    // Вложения к ТЗ задачи загружаются после ее создания
    const failed = []
    for (const file of attachments.value) {
      try {
        await api.upload(`/tasks/${task.id}/files`, file)
      } catch (error) {
        failed.push(`${file.name}: ${error.message}`)
      }
    }
    Object.assign(form, emptyForm())
    attachments.value = []
    if (fileInput.value) fileInput.value.value = ''
    if (failed.length) formError.value = `Задача создана, но не все файлы загружены. ${failed.join('; ')}`
    else formOpen.value = false
    await load({ silent: true })
  } catch (error) {
    formError.value = error.message
  } finally {
    creating.value = false
  }
}

watch(() => props.dealId, () => {
  formOpen.value = false
  load()
})

// Обновляем список, чтобы новые макеты и статусы появлялись без перезагрузки
let timer = null
onMounted(async () => {
  load()
  timer = setInterval(() => !document.hidden && load({ silent: true }), 15_000)
  try {
    staff.value = (await api.get('/users/staff')).items
  } catch {
    // без справочника форма покажет ошибку при сохранении
  }
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="deal-tasks">
    <div class="toolbar">
      <h3>Задачи по сделке</h3>
      <button v-if="!formOpen" class="btn btn-small" type="button" @click="formOpen = true">Поставить задачу</button>
    </div>

    <form v-if="formOpen" class="create card" @submit.prevent="create">
      <label class="field wide"><span>Что сделать</span><input v-model.trim="form.title" class="control" required minlength="2" maxlength="200" placeholder="Например: макет баннера для КП" /></label>
      <label class="field"><span>Исполнитель</span>
        <select v-model="form.assigneeId" class="control" required>
          <option value="" disabled>Выберите сотрудника</option>
          <option v-for="person in staff" :key="person.id" :value="person.id">{{ person.fullName }} — {{ person.roleName }}</option>
        </select>
      </label>
      <label class="field"><span>Срок</span><input v-model="form.dueDate" class="control" type="date" /></label>
      <label class="field wide"><span>Описание (ТЗ)</span><textarea v-model="form.description" class="control" rows="3" maxlength="5000" placeholder="Размеры, тексты, пожелания клиента"></textarea></label>
      <label class="field wide"><span>Вложения</span><input ref="fileInput" class="control file-input" type="file" multiple :accept="FILE_ACCEPT" @change="onFiles" /></label>
      <p v-if="formError" class="notice notice-error wide" role="alert">{{ formError }}</p>
      <div class="actions wide">
        <button class="btn btn-small" type="submit" :disabled="creating">{{ creating ? 'Сохранение…' : 'Создать задачу' }}</button>
        <button class="btn btn-ghost btn-small" type="button" @click="formOpen = false">Отмена</button>
      </div>
    </form>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!tasks.length && !formOpen" class="muted empty">Задач по сделке пока нет. Поставьте задачу дизайнеру — например, подготовить макет для коммерческого предложения.</p>

    <ul class="list">
      <li v-for="task in tasks" :key="task.id" class="task card" :class="{ done: task.status === 'done' }">
        <div class="task-head">
          <RouterLink class="task-title" :to="{ name: 'task', params: { id: task.id } }">{{ task.title }}</RouterLink>
          <span class="badge" :class="`status-${task.status}`">{{ taskStatusName(task.status) }}</span>
        </div>
        <p class="task-meta">
          {{ task.assignee.fullName }}
          <template v-if="task.dueDate"> · <span :class="{ overdue: task.isOverdue }">до {{ dateLabel(task.dueDate) }}</span></template>
          <template v-if="task.commentCount"> · комментариев: {{ task.commentCount }}</template>
        </p>
        <FileList v-if="task.files.length" :files="task.files" compact />
      </li>
    </ul>
  </div>
</template>

<style scoped src="../styles/deal-tasks.css"></style>
