<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { channelName, fullTime, money, shortTime, stageName } from '../labels.js'

const route = useRoute()

const card = ref(null)
const loadError = ref('')
const form = reactive({ name: '', phone: '', email: '', company: '', inn: '', address: '', note: '' })
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

function fillForm(client) {
  Object.assign(form, {
    name: client.name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    company: client.company ?? '',
    inn: client.inn ?? '',
    address: client.address ?? '',
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

// Учетная запись клиента для личного кабинета (FR-PORT-01)
const account = reactive({ login: '', password: '' })
const accountBusy = ref(false)
const accountError = ref('')
const accountInfo = ref('')
const newPassword = ref('')

async function accountAction(action, successText) {
  accountBusy.value = true
  accountError.value = ''
  accountInfo.value = ''
  try {
    card.value = await action()
    accountInfo.value = successText
    return true
  } catch (error) {
    accountError.value = error.message
    return false
  } finally {
    accountBusy.value = false
  }
}

async function createAccount() {
  const login = account.login
  const ok = await accountAction(
    () => api.post(`/clients/${route.params.id}/account`, { ...account }),
    `Учетная запись создана. Передайте клиенту логин «${login}» и пароль — он войдет на странице входа.`,
  )
  if (ok) Object.assign(account, { login: '', password: '' })
}

const toggleAccount = (portalAccount) =>
  accountAction(
    () => api.patch(`/clients/${route.params.id}/account/${portalAccount.id}`, { isActive: !portalAccount.isActive }),
    portalAccount.isActive ? 'Доступ в кабинет заблокирован.' : 'Доступ в кабинет восстановлен.',
  )

async function changePassword(portalAccount) {
  const ok = await accountAction(
    () => api.patch(`/clients/${route.params.id}/account/${portalAccount.id}`, { password: newPassword.value }),
    'Пароль изменен.',
  )
  if (ok) newPassword.value = ''
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
            <div class="pair">
              <label class="field"><span>ИНН (для счета)</span><input v-model.trim="form.inn" class="control" inputmode="numeric" pattern="\d{10}|\d{12}" title="10 или 12 цифр" /></label>
              <label class="field"><span>Адрес (для счета)</span><input v-model.trim="form.address" class="control" maxlength="300" /></label>
            </div>
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
              <li v-for="project in card.projects" :key="project.id">
                <RouterLink class="row-link" :to="{ name: 'project', params: { id: project.id } }">
                  <span class="row-main"><b>{{ project.title }}</b><small>{{ fullTime(project.createdAt) }}</small></span>
                  <span class="row-side">
                    <span class="badge" :class="{ 'badge-accent': project.status === 'completed' }">{{ project.status === 'completed' ? 'Завершен' : project.currentStage?.name }}</span>
                    <small>{{ money(project.deal.amount) }}</small>
                  </span>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="muted empty">Проектов пока нет: проект создается из оплаченной сделки.</p>
          </section>

          <section class="card block">
            <h2>Личный кабинет</h2>
            <template v-if="card.portalAccounts.length">
              <div v-for="portalAccount in card.portalAccounts" :key="portalAccount.id" class="account">
                <p class="account-line">
                  Логин <b>{{ portalAccount.login }}</b>
                  <span class="badge" :class="portalAccount.isActive ? 'badge-accent' : 'badge-danger'">{{ portalAccount.isActive ? 'Доступ открыт' : 'Заблокирован' }}</span>
                </p>
                <form class="account-form" @submit.prevent="changePassword(portalAccount)">
                  <input v-model="newPassword" class="control" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Новый пароль, от 8 символов" aria-label="Новый пароль клиента" />
                  <button class="btn btn-ghost btn-small" type="submit" :disabled="accountBusy || newPassword.length < 8">Сменить пароль</button>
                  <button class="btn btn-ghost btn-small" type="button" :disabled="accountBusy" @click="toggleAccount(portalAccount)">{{ portalAccount.isActive ? 'Заблокировать' : 'Разблокировать' }}</button>
                </form>
              </div>
            </template>
            <form v-else class="account-create" @submit.prevent="createAccount">
              <p class="muted">Клиент сможет видеть статусы своих заказов и архив проектов.</p>
              <label class="field"><span>Логин клиента</span><input v-model.trim="account.login" class="control" required pattern="[a-zA-Z0-9._\-]{3,40}" autocomplete="off" title="3–40 символов: латинские буквы, цифры, точка, дефис, подчеркивание" /></label>
              <label class="field"><span>Пароль (не короче 8 символов)</span><input v-model="account.password" class="control" type="password" required minlength="8" maxlength="72" autocomplete="new-password" /></label>
              <button class="btn" type="submit" :disabled="accountBusy">Создать доступ в кабинет</button>
            </form>
            <p v-if="accountError" class="notice notice-error" role="alert">{{ accountError }}</p>
            <p v-if="accountInfo" class="notice" role="status">{{ accountInfo }}</p>
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
