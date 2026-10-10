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

<style scoped src="../styles/home.css"></style>
