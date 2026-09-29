<script setup>
import { ref } from 'vue'

const login = ref('')
const password = ref('')
const rememberMe = ref(true)
const passwordVisible = ref(false)
const message = ref('')

function submitForm() {
  message.value = 'Интерфейс готов. Авторизация появится после подключения сервера.'
}

function showAccessInfo() {
  message.value = 'Учетную запись для входа создает менеджер системы.'
}

function showRecoveryInfo() {
  message.value = 'Для восстановления пароля обратитесь к менеджеру системы.'
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

          <button class="submit-button" type="submit"><span>Войти</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <p v-if="message" class="form-message" role="status">{{ message }}</p>
        </form>

        <div class="access-note">
          <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.4"/><path d="M10 9v4m0-6h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <p>Нет учетной записи? <button class="text-action" type="button" @click="showAccessInfo">Обратитесь к менеджеру</button></p>
        </div>
      </div>

      <footer class="form-footer"><span>© 2026 Агентство</span><span class="footer-divider"></span><span>CRM-платформа</span><a href="#privacy" @click.prevent="message = 'Политика конфиденциальности будет доступна после запуска системы.'">Конфиденциальность</a></footer>
    </section>
  </main>
</template>

<style>
:root {
  font-family: 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #20231f;
  background: #f4f5f1;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-optical-sizing: auto;
  font-weight: 400;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 360px; min-height: 100vh; }
button, input { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }

.auth-layout {
  width: min(1600px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1.07fr) minmax(500px, .93fr);
  gap: 20px;
}

.welcome-panel {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: calc(100vh - 44px);
  padding: 34px 42px 28px;
  display: flex;
  flex-direction: column;
  color: #f4f5ee;
  border-radius: 26px;
  background: #202a24;
}
.welcome-topline, .brand, .workspace-label, .flow-heading, .flow-footer, .welcome-footer { display: flex; align-items: center; }
.welcome-topline { position: relative; z-index: 1; justify-content: space-between; }
.brand { width: fit-content; gap: 10px; text-decoration: none; color: inherit; }
.brand-mark { width: 34px; height: 34px; display: grid; place-items: center; color: #d6ff70; }
.brand-mark svg { width: 100%; height: 100%; }
.brand-name { font-size: 16px; font-weight: 800; letter-spacing: -.8px; }
.brand-period { color: #d6ff70; }
.workspace-label { gap: 8px; color: #b3bdb5; font-size: 11px; font-weight: 600; letter-spacing: .015em; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #d6ff70; box-shadow: 0 0 12px #d6ff7055; }
.welcome-copy { position: relative; z-index: 1; max-width: 620px; margin: auto 0 52px; padding-top: 64px; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 21px; color: #cad1ca; font-size: 11px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; }
.eyebrow-line { width: 20px; height: 1px; background: #d6ff70; }
.welcome-copy h1 { margin: 0; font-size: clamp(38px, 4.1vw, 61px); line-height: 1.12; font-weight: 600; letter-spacing: -.065em; }
.welcome-copy h1 span { color: #d6ff70; }
.welcome-description { max-width: 440px; margin: 20px 0 0; color: #afb8b0; font-size: 13px; line-height: 1.85; }
.flow-visual { position: relative; z-index: 1; padding: 19px 20px 15px; border: 1px solid #ffffff20; border-radius: 15px; background: #ffffff08; backdrop-filter: blur(8px); }
.flow-heading, .flow-footer { justify-content: space-between; color: #aeb8af; font-size: 9px; font-weight: 700; letter-spacing: .12em; }
.flow-heading-right { display: flex; gap: 4px; }
.flow-heading-right i { width: 3px; height: 3px; border-radius: 50%; background: #aeb8af; opacity: .7; }
.flow-track { display: grid; grid-template-columns: minmax(0,1fr) 20px minmax(0,1fr) 20px minmax(0,1fr); align-items: center; margin: 18px 0 15px; }
.flow-node { min-width: 0; min-height: 61px; display: flex; align-items: center; gap: 9px; padding: 10px 9px; border: 1px solid #ffffff13; border-radius: 10px; background: #ffffff08; }
.flow-node.node-active { border-color: #d6ff7048; background: #d6ff7010; }
.node-icon { width: 29px; height: 29px; flex: 0 0 29px; display: grid; place-items: center; border-radius: 8px; }
.node-icon svg { width: 19px; height: 19px; }
.node-icon-inbox { color: #d6ff70; background: #d6ff7018; }
.node-icon-deal { color: #d7b8ff; background: #d7b8ff17; }
.node-icon-project { color: #8dd8d3; background: #8dd8d315; }
.flow-node b, .flow-node small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-node b { color: #f0f2ec; font-size: 10px; font-weight: 700; }
.flow-node small { margin-top: 4px; color: #9da89f; font-size: 8px; }
.node-arrow { margin-left: auto; color: #839087; font-size: 11px; }
.flow-connector { height: 1px; background: #ffffff32; }
.flow-footer { font-size: 8px; letter-spacing: .1em; }
.flow-footer > span:last-child { display: flex; align-items: center; gap: 6px; letter-spacing: .04em; }
.flow-footer i { width: 19px; height: 1px; background: #d6ff70; }
.welcome-footer { position: relative; z-index: 1; justify-content: space-between; margin-top: 21px; color: #9ca79e; font-size: 10px; }
.footer-symbol { color: #d6ff70; font-size: 16px; }
.decor-orb { position: absolute; z-index: -1; width: 430px; height: 430px; top: 17%; right: -230px; border: 1px solid #ffffff0b; border-radius: 50%; box-shadow: 0 0 0 42px #ffffff06, 0 0 0 84px #ffffff04, 0 0 0 126px #ffffff03; }

.form-panel { min-height: calc(100vh - 44px); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 54px clamp(40px, 7.2vw, 112px) 23px; border: 1px solid #e9ebe5; border-radius: 26px; background: #fff; }
.form-content { width: min(100%, 400px); margin: auto 0; }
.form-heading { margin-bottom: 34px; }
.form-kicker { display: inline-block; margin-bottom: 11px; color: #7c887c; font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.form-heading h2 { margin: 0; color: #20231f; font-size: 30px; font-weight: 700; line-height: 1.25; letter-spacing: -.055em; }
.form-heading p { margin: 9px 0 0; color: #81877f; font-size: 12px; line-height: 1.6; }
.login-form { display: flex; flex-direction: column; }
.field-label { display: block; margin-bottom: 9px; color: #393e38; font-size: 11px; font-weight: 700; }
.input-wrap { position: relative; height: 49px; display: flex; align-items: center; margin-bottom: 21px; border: 1px solid #e5e8e1; border-radius: 9px; background: #fff; transition: border-color .18s, box-shadow .18s, background .18s; }
.input-wrap:focus-within { border-color: #889879; background: #fff; box-shadow: 0 0 0 3px #879b7220; }
.input-icon { width: 17px; height: 17px; flex: 0 0 auto; margin-left: 14px; color: #99a095; }
.input-wrap input { width: 100%; height: 100%; min-width: 0; padding: 0 13px; border: 0; outline: 0; color: #272d26; background: transparent; font-size: 11px; }
.input-wrap input::placeholder { color: #b0b6ae; opacity: 1; }
.password-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.text-action { padding: 0; border: 0; color: #59684f; background: transparent; font-size: 10px; font-weight: 700; text-decoration: none; cursor: pointer; }
.text-action:hover { color: #303d29; text-decoration: underline; text-underline-offset: 3px; }
.forgot-action { margin: 0 0 9px; color: #778273; font-size: 10px; font-weight: 600; }
.visibility-action { width: 40px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; margin-right: 3px; border: 0; border-radius: 7px; color: #929a90; background: transparent; cursor: pointer; }
.visibility-action:hover { color: #3e4d38; background: #f5f6f3; }
.visibility-action svg { width: 17px; height: 17px; }
.form-options { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 23px; }
.remember-option { position: relative; display: inline-flex; align-items: center; gap: 8px; color: #626a60; font-size: 10px; cursor: pointer; user-select: none; }
.remember-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.custom-checkbox { width: 15px; height: 15px; display: grid; place-items: center; border: 1px solid #d9ded5; border-radius: 4px; color: #253020; background: #fff; transition: all .15s; }
.custom-checkbox svg { width: 11px; height: 11px; opacity: 0; }
.remember-option input:checked + .custom-checkbox { border-color: #d7f782; background: #d7f782; }
.remember-option input:checked + .custom-checkbox svg { opacity: 1; }
.remember-option input:focus-visible + .custom-checkbox { outline: 3px solid #879b722d; outline-offset: 2px; }
.secure-note { display: flex; align-items: center; gap: 5px; color: #939b91; font-size: 9px; }
.secure-note svg { width: 14px; height: 14px; color: #82927a; }
.submit-button { width: 100%; height: 49px; display: flex; align-items: center; justify-content: center; gap: 9px; border: 0; border-radius: 9px; color: #22291d; background: #d7f782; font-size: 12px; font-weight: 800; cursor: pointer; transition: background .18s, transform .18s, box-shadow .18s; }
.submit-button:hover { transform: translateY(-1px); background: #cbef6a; box-shadow: 0 6px 18px #b4d76535; }
.submit-button:active { transform: translateY(0); }
.submit-button svg { width: 17px; height: 17px; }
.form-message { margin: 13px 0 0; padding: 10px 12px; border: 1px solid #e4ebd9; border-radius: 8px; color: #53614b; background: #f7faef; font-size: 10px; line-height: 1.6; }
.access-note { display: flex; align-items: center; gap: 10px; margin-top: 26px; padding-top: 19px; border-top: 1px solid #eff0ed; }
.access-icon { width: 25px; height: 25px; flex: 0 0 25px; display: grid; place-items: center; border-radius: 50%; color: #738169; background: #f1f4eb; }
.access-icon svg { width: 15px; height: 15px; }
.access-note p { margin: 0; color: #81877f; font-size: 10px; }
.access-note .text-action { margin-left: 2px; font-size: 10px; }
.form-footer { width: min(100%, 400px); display: flex; align-items: center; gap: 9px; padding-top: 27px; color: #a0a69d; font-size: 9px; }
.footer-divider { width: 3px; height: 3px; border-radius: 50%; background: #c6cbc3; }
.form-footer a { margin-left: auto; color: #92998f; text-decoration: none; }
.form-footer a:hover { color: #4c5846; }
.mobile-brand-row { display: none; }

@media (max-width: 1080px) {
  .auth-layout { grid-template-columns: minmax(0, 1fr) minmax(430px, .95fr); gap: 14px; padding: 14px; }
  .welcome-panel, .form-panel { min-height: calc(100vh - 28px); }
  .welcome-panel { padding: 28px 28px 23px; }
  .flow-visual { padding-right: 13px; padding-left: 13px; }
  .flow-track { grid-template-columns: minmax(0,1fr) 12px minmax(0,1fr) 12px minmax(0,1fr); }
  .flow-node { gap: 6px; padding: 8px 6px; }
  .node-icon { width: 25px; height: 25px; flex-basis: 25px; }
  .node-icon svg { width: 17px; height: 17px; }
  .flow-node small { font-size: 7px; }
  .form-panel { padding-right: 48px; padding-left: 48px; }
}

@media (max-width: 820px) {
  .auth-layout { width: 100%; min-height: 100svh; display: block; padding: 0; background: #fff; }
  .welcome-panel { display: none; }
  .form-panel { min-height: 100svh; padding: 26px 26px 18px; border: 0; border-radius: 0; }
  .mobile-brand-row { width: min(100%, 440px); display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .brand-dark { color: #273027; }
  .brand-dark .brand-mark { color: #71815d; }
  .brand-dark .brand-period { color: #71815d; }
  .mobile-workspace { color: #969d93; font-size: 10px; font-weight: 600; }
  .form-content { width: min(100%, 440px); }
  .form-footer { width: min(100%, 440px); }
}

@media (max-width: 480px) {
  body { min-width: 320px; }
  .form-panel { padding: 21px 22px 17px; }
  .form-heading { margin-bottom: 29px; }
  .form-heading h2 { font-size: 27px; }
  .form-options { align-items: flex-start; }
  .secure-note { font-size: 8px; }
  .form-footer { gap: 7px; font-size: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
