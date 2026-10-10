<script setup>
import { onMounted, reactive, ref } from 'vue'
import { api } from '../api.js'
import { auth } from '../auth.js'

const users = ref([])
const roles = ref([])
const loadError = ref('')
const loading = ref(true)
const rowError = ref('')
const busyId = ref(null)

const emptyForm = () => ({ fullName: '', login: '', email: '', password: '', role: 'manager' })
const form = reactive(emptyForm())
const formOpen = ref(false)
const creating = ref(false)
const formError = ref('')

// Клиентские учетные записи создаются из карточки клиента на этапе личного кабинета
const staffRoles = () => roles.value.filter((role) => role.code !== 'client')

async function load() {
  try {
    const [userList, roleList] = await Promise.all([api.get('/users'), api.get('/users/roles')])
    users.value = userList.items
    roles.value = roleList.items
    loadError.value = ''
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function create() {
  creating.value = true
  formError.value = ''
  try {
    const { user } = await api.post('/users', { ...form, email: form.email || null })
    users.value = [...users.value, user].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
    Object.assign(form, emptyForm())
    formOpen.value = false
  } catch (error) {
    formError.value = error.message
  } finally {
    creating.value = false
  }
}

async function update(user, changes) {
  busyId.value = user.id
  rowError.value = ''
  try {
    const { user: updated } = await api.patch(`/users/${user.id}`, changes)
    users.value = users.value.map((item) => (item.id === updated.id ? updated : item))
  } catch (error) {
    rowError.value = `${user.fullName}: ${error.message}`
    // возвращаем элементы управления к сохраненным значениям
    users.value = [...users.value]
  } finally {
    busyId.value = null
  }
}

const isSelf = (user) => user.id === auth.user.id

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1>Пользователи</h1>
        <p class="muted">Учетные записи сотрудников, роли и блокировка доступа.</p>
      </div>
      <button v-if="!formOpen" class="btn" type="button" @click="formOpen = true">Добавить сотрудника</button>
    </header>

    <form v-if="formOpen" class="card create-form" @submit.prevent="create">
      <h2>Новый сотрудник</h2>
      <div class="form-grid">
        <label class="field"><span>Имя и фамилия</span><input v-model.trim="form.fullName" class="control" required minlength="2" maxlength="120" /></label>
        <label class="field"><span>Логин</span><input v-model.trim="form.login" class="control" required pattern="[a-zA-Z0-9._\-]{3,40}" autocomplete="off" title="3–40 символов: латинские буквы, цифры, точка, дефис, подчеркивание" /></label>
        <label class="field"><span>Рабочая почта (необязательно)</span><input v-model.trim="form.email" class="control" type="email" autocomplete="off" /></label>
        <label class="field"><span>Роль</span>
          <select v-model="form.role" class="control">
            <option v-for="role in staffRoles()" :key="role.code" :value="role.code">{{ role.name }}</option>
          </select>
        </label>
        <label class="field"><span>Пароль (не короче 8 символов)</span><input v-model="form.password" class="control" type="password" required minlength="8" maxlength="72" autocomplete="new-password" /></label>
      </div>
      <p v-if="formError" class="notice notice-error" role="alert">{{ formError }}</p>
      <div class="form-actions">
        <button class="btn" type="submit" :disabled="creating">{{ creating ? 'Создание…' : 'Создать учетную запись' }}</button>
        <button class="btn btn-ghost" type="button" @click="formOpen = false">Отмена</button>
      </div>
    </form>

    <p v-if="loadError" class="notice notice-error" role="alert">{{ loadError }}</p>
    <p v-if="rowError" class="notice notice-error" role="alert">{{ rowError }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>

    <div v-else-if="users.length" class="card table-wrap">
      <table>
        <thead>
          <tr><th>Сотрудник</th><th>Логин</th><th>Роль</th><th>Статус</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" :class="{ blocked: !user.isActive }">
            <td>
              <b>{{ user.fullName }}</b>
              <small v-if="user.email">{{ user.email }}</small>
            </td>
            <td class="mono">{{ user.login }}</td>
            <td>
              <select class="control role-select" :value="user.role" :disabled="isSelf(user) || busyId === user.id" :aria-label="`Роль: ${user.fullName}`" @change="update(user, { role: $event.target.value })">
                <option v-for="role in roles" :key="role.code" :value="role.code" :disabled="role.code === 'client' && !user.clientId">{{ role.name }}</option>
              </select>
            </td>
            <td><span class="badge" :class="user.isActive ? 'badge-accent' : 'badge-danger'">{{ user.isActive ? 'Активен' : 'Заблокирован' }}</span></td>
            <td class="actions">
              <span v-if="isSelf(user)" class="muted">Это вы</span>
              <button v-else class="btn btn-ghost btn-small" type="button" :disabled="busyId === user.id" @click="update(user, { isActive: !user.isActive })">
                {{ user.isActive ? 'Заблокировать' : 'Разблокировать' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; display: flex; flex-direction: column; gap: 16px; padding: 24px 28px 40px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.page-header h1 { margin: 0; font-size: 26px; letter-spacing: -.04em; }
.page-header p { margin: 6px 0 0; font-size: 13px; }
.create-form { display: flex; flex-direction: column; gap: 16px; padding: 20px; }
.create-form h2 { margin: 0; font-size: 15px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.form-actions { display: flex; gap: 8px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { padding: 12px 16px; border-bottom: 1px solid var(--line); color: var(--ink-muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-align: left; text-transform: uppercase; white-space: nowrap; }
td { padding: 11px 16px; border-bottom: 1px solid #eff1ec; vertical-align: middle; }
tbody tr:last-child td { border-bottom: 0; }
td b, td small { display: block; }
td small { margin-top: 3px; color: var(--ink-muted); font-size: 12px; }
tr.blocked td b, tr.blocked .mono { color: var(--ink-muted); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.role-select { min-width: 190px; height: 32px; font-size: 12px; }
.actions { text-align: right; white-space: nowrap; }
.actions .muted { font-size: 12px; }
</style>
