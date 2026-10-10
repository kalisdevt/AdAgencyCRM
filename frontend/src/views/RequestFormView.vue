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

<style scoped src="../styles/request.css"></style>
