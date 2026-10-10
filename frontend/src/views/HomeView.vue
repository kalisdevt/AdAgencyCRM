<script setup>
import { computed } from 'vue'
import { auth } from '../auth.js'

const user = computed(() => auth.user)
</script>

<template>
  <section class="home">
    <p class="kicker">{{ user.roleName }}</p>
    <h1>Здравствуйте, {{ user.fullName }}</h1>
    <p class="lead">
      Вы вошли в CRM агентства. Сейчас в системе работают прием обращений, лента «Входящие» и карточки клиентов —
      они доступны менеджерам и руководителю отдела продаж.
    </p>
    <p class="notice">
      Разделы для вашей роли (задачи, проекты, отчеты, личный кабинет) появятся на следующих этапах разработки.
    </p>
  </section>
</template>

<style scoped>
.home { max-width: 640px; padding: 56px 40px; }
.kicker { margin: 0 0 10px; color: var(--ink-muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -.04em; text-wrap: balance; }
.lead { margin: 14px 0 20px; color: var(--ink-soft); font-size: 15px; line-height: 1.6; }
</style>
