<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { auth, SALES_ROLES } from '../auth.js'
import { dateLabel, FILE_ACCEPT, fullTime, shortTime, stageName, TASK_STATUSES } from '../labels.js'
import FileList from '../components/FileList.vue'

const route = useRoute()

const card = ref(null)
const loadError = ref('')
const actionError = ref('')
const saving = ref(false)

const staff = ref([])
const editing = ref(false)
const form = reactive({ title: '', description: '', assigneeId: '', dueDate: '' })

const commentText = ref('')
const sendingComment = ref(false)
const uploading = ref(false)
const fileInput = ref(null)

const task = computed(() => card.value?.task)
const isSales = computed(() => auth.hasRole(...SALES_ROLES))
const canChangeStatus = computed(() => card.value && (card.value.canEdit || task.value.assignee.id === auth.user.id))

async function load() {
  loadError.value = ''
  try {
    card.value = await api.get(`/tasks/${route.params.id}`)
  } catch (error) {
    card.value = null
    loadError.value = error.message
  }
}

async function patch(changes) {
  saving.value = true
  actionError.value = ''
  try {
    const { task: updated } = await api.patch(`/tasks/${task.value.id}`, changes)
    card.value.task = updated
    return true
  } catch (error) {
    actionError.value = error.message
    return false
  } finally {
    saving.value = false
  }
}

function onStatusChange(event) {
  patch({ status: event.target.value }).then((ok) => {
    if (!ok) event.target.value = task.value.status
  })
}

async function startEdit() {
  Object.assign(form, {
    title: task.value.title,
    description: task.value.description ?? '',
    assigneeId: task.value.assignee.id,
    dueDate: task.value.dueDate ?? '',
  })
  editing.value = true
  if (!staff.value.length && isSales.value) {
    try {
      staff.value = (await api.get('/users/staff')).items
    } catch {
      staff.value = [task.value.assignee]
    }
  }
}

async function saveEdit() {
  const ok = await patch({
    title: form.title,
    description: form.description || null,
    assigneeId: Number(form.assigneeId),
    dueDate: form.dueDate || null,
  })
  if (ok) editing.value = false
}

async function sendComment() {
  const text = commentText.value.trim()
  if (!text || sendingComment.value) return
  sendingComment.value = true
  actionError.value = ''
  try {
    const { comment } = await api.post(`/tasks/${task.value.id}/comments`, { text })
    card.value.comments.push(comment)
    commentText.value = ''
  } catch (error) {
    actionError.value = error.message
  } finally {
    sendingComment.value = false
  }
}

async function uploadFiles(event) {
  const files = [...event.target.files]
  if (!files.length) return
  uploading.value = true
  actionError.value = ''
  const failed = []
  for (const file of files) {
    try {
      const { file: saved } = await api.upload(`/tasks/${task.value.id}/files`, file)
      card.value.task.files.push(saved)
    } catch (error) {
      failed.push(`${file.name}: ${error.message}`)
    }
  }
  if (failed.length) actionError.value = failed.join('; ')
  if (fileInput.value) fileInput.value.value = ''
  uploading.value = false
}

watch(() => route.params.id, () => {
  editing.value = false
  load()
}, { immediate: true })
</script>

<template>
  <div class="page">
    <RouterLink class="back-link" :to="{ name: 'tasks' }">← Задачи</RouterLink>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-else-if="!card" class="muted">Загрузка…</p>

    <template v-else>
      <header class="task-header">
        <div class="title">
          <h1>{{ task.title }}</h1>
          <p class="muted">
            <template v-if="isSales">
              <RouterLink :to="{ name: 'inbox', params: { dealId: task.deal.id } }">{{ task.client.name }} · {{ task.deal.title }}</RouterLink>
            </template>
            <template v-else>{{ task.client.name }} · {{ task.deal.title }}</template>
            · стадия сделки: {{ stageName(task.deal.stage) }}
          </p>
        </div>
        <label class="field status">
          <span>Статус</span>
          <select class="control" :class="`status-${task.status}`" :value="task.status" :disabled="!canChangeStatus || saving" @change="onStatusChange">
            <option v-for="status in TASK_STATUSES" :key="status.code" :value="status.code">{{ status.name }}</option>
          </select>
        </label>
      </header>

      <p v-if="actionError" class="notice notice-error" role="alert">{{ actionError }}</p>

      <div class="grid">
        <div class="column">
          <section class="card block">
            <div class="block-head">
              <h2>Описание</h2>
              <button v-if="card.canEdit && !editing" class="btn btn-ghost btn-small" type="button" @click="startEdit">Изменить</button>
            </div>

            <form v-if="editing" class="edit" @submit.prevent="saveEdit">
              <label class="field"><span>Название</span><input v-model.trim="form.title" class="control" required minlength="2" maxlength="200" /></label>
              <label class="field"><span>Исполнитель</span>
                <select v-model="form.assigneeId" class="control" required>
                  <option v-for="person in staff" :key="person.id" :value="person.id">{{ person.fullName }}<template v-if="person.roleName"> — {{ person.roleName }}</template></option>
                </select>
              </label>
              <label class="field"><span>Срок</span><input v-model="form.dueDate" class="control" type="date" /></label>
              <label class="field"><span>Описание (ТЗ)</span><textarea v-model="form.description" class="control" rows="5" maxlength="5000"></textarea></label>
              <div class="actions">
                <button class="btn btn-small" type="submit" :disabled="saving">Сохранить</button>
                <button class="btn btn-ghost btn-small" type="button" @click="editing = false">Отмена</button>
              </div>
            </form>

            <template v-else>
              <p v-if="task.description" class="description">{{ task.description }}</p>
              <p v-else class="muted">Описание не заполнено.</p>
              <dl class="facts">
                <div><dt>Исполнитель</dt><dd>{{ task.assignee.fullName }}</dd></div>
                <div><dt>Поставил(а)</dt><dd>{{ task.author.fullName }}</dd></div>
                <div><dt>Срок</dt><dd :class="{ overdue: task.isOverdue }">{{ task.dueDate ? dateLabel(task.dueDate) : 'не указан' }}<template v-if="task.isOverdue"> — просрочено</template></dd></div>
                <div><dt>Создана</dt><dd>{{ fullTime(task.createdAt) }}</dd></div>
              </dl>
            </template>
          </section>

          <section class="card block">
            <div class="block-head">
              <h2>Файлы и макеты</h2>
              <label class="btn btn-small upload" :class="{ disabled: uploading }">
                {{ uploading ? 'Загрузка…' : 'Загрузить файл' }}
                <input ref="fileInput" type="file" multiple :accept="FILE_ACCEPT" :disabled="uploading" @change="uploadFiles" />
              </label>
            </div>
            <FileList v-if="task.files.length" :files="task.files" />
            <p v-else class="muted">Файлов пока нет. Загрузите макет — постановщик получит уведомление.</p>
          </section>
        </div>

        <section class="card block comments">
          <h2>Комментарии</h2>
          <ol v-if="card.comments.length" class="timeline">
            <li v-for="comment in card.comments" :key="comment.id" :class="{ own: comment.author.id === auth.user.id }">
              <small><b>{{ comment.author.fullName }}</b> · <time :title="fullTime(comment.createdAt)">{{ shortTime(comment.createdAt) }}</time></small>
              <p>{{ comment.text }}</p>
            </li>
          </ol>
          <p v-else class="muted">Комментариев пока нет.</p>
          <form class="comment-form" @submit.prevent="sendComment">
            <textarea v-model="commentText" class="control" rows="3" maxlength="4000" placeholder="Комментарий для участников задачи" aria-label="Текст комментария"></textarea>
            <button class="btn" type="submit" :disabled="sendingComment || !commentText.trim()">{{ sendingComment ? 'Отправка…' : 'Отправить' }}</button>
          </form>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped src="../styles/task.css"></style>
