<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, homeRouteFor } from '../auth.js'

const router = useRouter()
const route = useRoute()

const login = ref('')
const password = ref('')
const rememberMe = ref(true)
const passwordVisible = ref(false)
const message = ref(route.query.expired ? 'Сессия завершена. Войдите заново.' : '')
const isError = ref(false)
const submitting = ref(false)

function showInfo(text) {
  isError.value = false
  message.value = text
}

async function submitForm() {
  if (submitting.value) return
  submitting.value = true
  message.value = ''
  try {
    const user = await auth.login(login.value, password.value, rememberMe.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : null
    await router.replace(redirect ?? homeRouteFor(user))
  } catch (error) {
    isError.value = true
    message.value = error.message
  } finally {
    submitting.value = false
  }
}

function showAccessInfo() {
  showInfo('Учетную запись для входа создает администратор системы.')
}

function showRecoveryInfo() {
  showInfo('Для восстановления пароля обратитесь к администратору системы.')
}
</script>

<template>
  <main class="auth-layout">
    <section class="welcome-panel" aria-labelledby="welcome-title">
      <div class="welcome-topline">
        <div class="brand brand-light" aria-label="Агентство">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none">
              <path d="M18 3.75 32.25 12v12L18 32.25 3.75 24V12L18 3.75Z" stroke="currentColor" stroke-width="1.5" />
              <path d="m18 10.25 7.75 4.5v6.5L18 25.75l-7.75-4.5v-6.5L18 10.25Z" fill="currentColor" />
            </svg>
          </span>
          <span class="brand-name">агентство<span class="brand-period">.</span></span>
        </div>
        <span class="workspace-label"><span class="status-dot"></span> Рабочее пространство</span>
      </div>

      <div class="welcome-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> CRM для рекламного агентства</p>
        <h1 id="welcome-title">Хорошие проекты<br />начинаются <span>с порядка.</span></h1>
        <p class="welcome-description">
          Клиенты, команда и проекты — в одном пространстве. Всё важное под рукой, чтобы сосредоточиться на работе.
        </p>
      </div>

      <div class="flow-visual" aria-hidden="true">
        <div class="flow-heading">
          <span>РАБОЧИЙ ПРОЦЕСС</span>
          <span class="flow-heading-right"><i></i><i></i><i></i></span>
        </div>
        <div class="flow-track">
          <div class="flow-node node-active">
            <span class="node-icon node-icon-inbox"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5h16v13H4v-13Z" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 13h4l1.5 2h4l1.5-2h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>
            <span><b>Клиенты</b><small>Входящие запросы</small></span>
            <span class="node-arrow">↗</span>
          </div>
          <span class="flow-connector"></span>
          <div class="flow-node">
            <span class="node-icon node-icon-deal"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5h16M6 4.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5"/><path d="M8 11h8M8 14.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
            <span><b>Сделки</b><small>Работа команды</small></span>
            <span class="node-arrow">↗</span>
          </div>
          <span class="flow-connector"></span>
          <div class="flow-node">
            <span class="node-icon node-icon-project"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5h14v14H5v-14Z" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h8M8 12.5h8M8 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m15.5 4 4.5 4.5" stroke="currentColor" stroke-width="1.5"/></svg></span>
            <span><b>Проекты</b><small>От идеи до результата</small></span>
            <span class="node-arrow">↗</span>
          </div>
        </div>
        <div class="flow-footer"><span>ЕДИНЫЙ РИТМ РАБОТЫ</span><span>01 <i></i> 03</span></div>
      </div>

      <div class="welcome-footer">
        <span>Всё для слаженной работы</span>
        <span class="footer-symbol" aria-hidden="true">✳</span>
      </div>
      <div class="decor-orb" aria-hidden="true"></div>
    </section>

    <section class="form-panel" aria-labelledby="form-title">
      <div class="mobile-brand-row">
        <div class="brand brand-dark" aria-label="Агентство">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none"><path d="M18 3.75 32.25 12v12L18 32.25 3.75 24V12L18 3.75Z" stroke="currentColor" stroke-width="1.5"/><path d="m18 10.25 7.75 4.5v6.5L18 25.75l-7.75-4.5v-6.5L18 10.25Z" fill="currentColor"/></svg>
          </span>
          <span class="brand-name">агентство<span class="brand-period">.</span></span>
        </div>
        <span class="mobile-workspace">Личный кабинет</span>
      </div>

      <div class="form-content">
        <div class="form-heading">
          <span class="form-kicker">С возвращением</span>
          <h2 id="form-title">Войти в систему</h2>
          <p>Введите данные рабочей учетной записи.</p>
        </div>

        <form class="login-form" @submit.prevent="submitForm">
          <label class="field-label" for="login">Логин или рабочая почта</label>
          <div class="input-wrap">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.25" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input id="login" v-model="login" type="text" name="username" autocomplete="username" placeholder="Например, anna@agency.ru" required />
          </div>

          <div class="password-label-row">
            <label class="field-label" for="password">Пароль</label>
            <button class="text-action forgot-action" type="button" @click="showRecoveryInfo">Не помню пароль</button>
          </div>
          <div class="input-wrap">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 14v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input id="password" v-model="password" :type="passwordVisible ? 'text' : 'password'" name="password" autocomplete="current-password" placeholder="Введите пароль" required />
            <button class="visibility-action" type="button" :aria-label="passwordVisible ? 'Скрыть пароль' : 'Показать пароль'" :aria-pressed="passwordVisible" @click="passwordVisible = !passwordVisible">
              <svg v-if="!passwordVisible" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.25" stroke="currentColor" stroke-width="1.5"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 16 16M10.6 7.2A9.7 9.7 0 0 1 12 7c5.5 0 8.5 5 8.5 5a15 15 0 0 1-2.4 2.7M6.2 8.2C4.4 9.4 3.5 12 3.5 12s3 5 8.5 5c.7 0 1.4-.1 2-.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <div class="form-options">
            <label class="remember-option"><input v-model="rememberMe" type="checkbox" name="remember" /><span class="custom-checkbox" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Запомнить меня</span></label>
            <span class="secure-note"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.75 13 3.5v4.15c0 3.1-2.1 5.5-5 6.6-2.9-1.1-5-3.5-5-6.6V3.5l5-1.75Z" stroke="currentColor" stroke-width="1.2"/><path d="m5.75 7.8 1.5 1.5 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Вход для команды</span>
          </div>

          <button class="submit-button" type="submit" :disabled="submitting"><span>{{ submitting ? 'Входим…' : 'Войти' }}</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <p v-if="message" class="form-message" :class="{ 'form-message-error': isError }" role="status">{{ message }}</p>
        </form>

        <div class="access-note">
          <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.4"/><path d="M10 9v4m0-6h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <p>Нет учетной записи? <button class="text-action" type="button" @click="showAccessInfo">Обратитесь к администратору</button></p>
        </div>
      </div>

      <footer class="form-footer"><span>© 2026 Агентство</span><span class="footer-divider"></span><span>CRM-платформа</span><a href="#privacy" @click.prevent="showInfo('В системе используются только тестовые данные.')">Конфиденциальность</a></footer>
    </section>
  </main>
</template>

<style scoped src="../styles/login.css"></style>
