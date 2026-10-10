<script setup>
import { reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'

// Страница имитирует сайт агентства: заявка уходит в CRM через открытый эндпоинт,
// UTM-метки берутся из адреса страницы (как при переходе с рекламы).
const route = useRoute()
const utm = {
  utm_source: route.query.utm_source,
  utm_medium: route.query.utm_medium,
  utm_campaign: route.query.utm_campaign,
}

// randomUUID доступен только в защищенном контексте (https или localhost)
const newRequestId = () =>
  globalThis.crypto?.randomUUID?.() ?? `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const form = reactive({ name: '', phone: '', email: '', message: '' })
// Один идентификатор на одну заявку: повторное нажатие «Отправить» не создаст дубль
let requestId = newRequestId()
const sending = ref(false)
const error = ref('')
const done = ref(false)

async function submit() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    await api.post('/public/leads', { ...form, ...utm, requestId })
    done.value = true
  } catch (failure) {
    error.value = failure.message
  } finally {
    sending.value = false
  }
}

function reset() {
  Object.assign(form, { name: '', phone: '', email: '', message: '' })
  requestId = newRequestId()
  done.value = false
}
</script>

<template>
  <main class="site">
    <header class="site-header">
      <span class="site-logo">агентство<i>.</i></span>
      <span class="site-tag">Дизайн · Печать · Наружная реклама</span>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <h1>Расскажите о задаче — предложим решение</h1>
        <p>Оставьте заявку, и менеджер свяжется с вами в течение рабочего дня.</p>
      </div>

      <div class="card form-card">
        <div v-if="done" class="success" role="status">
          <h2>Заявка отправлена</h2>
          <p>Спасибо! Мы получили вашу заявку и скоро свяжемся с вами.</p>
          <button class="btn btn-ghost" type="button" @click="reset">Отправить еще одну</button>
        </div>

        <form v-else class="form" @submit.prevent="submit">
          <h2>Оставить заявку</h2>
          <label class="field">
            <span>Как к вам обращаться</span>
            <input v-model.trim="form.name" class="control" name="name" autocomplete="name" required minlength="2" maxlength="120" />
          </label>
          <div class="row">
            <label class="field">
              <span>Телефон</span>
              <input v-model.trim="form.phone" class="control" name="phone" type="tel" autocomplete="tel" placeholder="+7 900 000-00-00" />
            </label>
            <label class="field">
              <span>Почта</span>
              <input v-model.trim="form.email" class="control" name="email" type="email" autocomplete="email" placeholder="name@example.ru" />
            </label>
          </div>
          <label class="field">
            <span>Что нужно сделать</span>
            <textarea v-model.trim="form.message" class="control" name="message" rows="4" maxlength="2000"></textarea>
          </label>
          <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
          <button class="btn" type="submit" :disabled="sending">{{ sending ? 'Отправляем…' : 'Отправить заявку' }}</button>
          <p class="hint">Укажите телефон или почту — хотя бы один способ связи.</p>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.site { min-height: 100vh; padding: 28px clamp(20px, 5vw, 72px) 48px; background: var(--page); }
.site-header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.site-logo { font-size: 20px; font-weight: 800; letter-spacing: -1px; }
.site-logo i { color: #71815d; font-style: normal; }
.site-tag { color: var(--ink-muted); font-size: 13px; }
.hero { max-width: 1080px; margin: clamp(32px, 8vh, 96px) auto 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 440px); gap: 48px; align-items: start; }
.hero-copy h1 { margin: 0; font-size: clamp(30px, 4vw, 46px); line-height: 1.12; font-weight: 700; letter-spacing: -.05em; text-wrap: balance; }
.hero-copy p { max-width: 420px; margin: 18px 0 0; color: var(--ink-soft); font-size: 16px; line-height: 1.6; }
.form-card { padding: 28px; }
.form { display: flex; flex-direction: column; gap: 16px; }
.form h2, .success h2 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hint { margin: 0; color: var(--ink-muted); font-size: 12px; }
.success { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.success p { margin: 0; color: var(--ink-soft); font-size: 14px; line-height: 1.6; }

@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; gap: 28px; }
  .site-tag { display: none; }
}
@media (max-width: 460px) {
  .row { grid-template-columns: 1fr; }
  .form-card { padding: 20px; }
}
</style>
