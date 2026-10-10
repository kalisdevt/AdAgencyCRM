<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { auth, SALES_ROLES } from '../auth.js'

const router = useRouter()
const user = computed(() => auth.user)

const navItems = computed(() =>
  [
    { to: { name: 'inbox' }, label: 'Входящие', roles: SALES_ROLES, icon: 'M4 5.5h16v13H4v-13Z M4.5 13h4l1.5 2h4l1.5-2h4' },
    { to: { name: 'users' }, label: 'Пользователи', roles: ['admin'], icon: 'M12 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z M5.5 19a6.5 6.5 0 0 1 13 0' },
    { to: { name: 'home' }, label: 'Главная', roles: ['designer', 'marketer', 'director', 'client'], icon: 'M4.5 11 12 4.5 19.5 11v8.5h-15V11Z' },
  ].filter((item) => item.roles.includes(user.value?.role)),
)

const initials = computed(() =>
  (user.value?.fullName ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join(''),
)

function logout() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div v-if="user" class="shell">
    <aside class="sidebar">
      <RouterLink class="logo" :to="{ name: 'home' }" aria-label="Агентство — на главную">
        <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M18 3.75 32.25 12v12L18 32.25 3.75 24V12L18 3.75Z" stroke="currentColor" stroke-width="1.5" />
          <path d="m18 10.25 7.75 4.5v6.5L18 25.75l-7.75-4.5v-6.5L18 10.25Z" fill="currentColor" />
        </svg>
        <span class="logo-name">агентство<i>.</i></span>
      </RouterLink>

      <nav class="nav" aria-label="Разделы">
        <RouterLink v-for="item in navItems" :key="item.label" class="nav-link" :to="item.to" :title="item.label">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path :d="item.icon" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>{{ item.label }}</span>
        </RouterLink>
        <a v-if="auth.hasRole(...SALES_ROLES)" class="nav-link" href="/request?utm_source=demo&utm_medium=crm&utm_campaign=site-form" target="_blank" rel="noopener" title="Форма заявки на сайте">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>Форма сайта</span>
        </a>
      </nav>

      <div class="profile">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="profile-text">
          <b>{{ user.fullName }}</b>
          <small>{{ user.roleName }}</small>
        </span>
        <button class="logout" type="button" title="Выйти" aria-label="Выйти" @click="logout">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped src="../styles/layout.css"></style>
