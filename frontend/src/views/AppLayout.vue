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

<style scoped>
.shell { height: 100vh; min-width: 768px; display: grid; grid-template-columns: 224px minmax(0, 1fr); background: var(--page); }
.sidebar { display: flex; flex-direction: column; gap: 26px; padding: 22px 14px 16px; color: #dfe5dc; background: var(--brand); }
.logo { display: flex; align-items: center; gap: 10px; padding: 0 8px; color: #d6ff70; text-decoration: none; }
.logo svg { width: 30px; height: 30px; flex: 0 0 auto; }
.logo-name { color: #f4f5ee; font-size: 16px; font-weight: 800; letter-spacing: -.8px; }
.logo-name i { color: #d6ff70; font-style: normal; }
.nav { display: flex; flex-direction: column; gap: 4px; }
.nav-link { height: 40px; display: flex; align-items: center; gap: 11px; padding: 0 10px; border-radius: 9px; color: #b9c2b8; font-size: 13px; font-weight: 600; text-decoration: none; transition: background .15s, color .15s; }
.nav-link svg { width: 20px; height: 20px; flex: 0 0 auto; }
.nav-link:hover { color: #fff; background: #ffffff0f; }
.nav-link.router-link-active { color: #1f2a1d; background: #d6ff70; }
.nav-link:focus-visible, .logout:focus-visible, .logo:focus-visible { outline: 2px solid #d6ff70; outline-offset: 2px; }
.profile { display: flex; align-items: center; gap: 10px; margin-top: auto; padding: 12px 8px 0; border-top: 1px solid #ffffff17; }
.avatar { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #1f2a1d; background: #d6ff70; font-size: 12px; font-weight: 800; }
.profile-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.profile-text b, .profile-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-text b { color: #f0f2ec; font-size: 12px; }
.profile-text small { color: #98a397; font-size: 11px; }
.logout { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; margin-left: auto; border: 0; border-radius: 8px; color: #b9c2b8; background: transparent; cursor: pointer; }
.logout:hover { color: #fff; background: #ffffff14; }
.logout svg { width: 19px; height: 19px; }
.content { min-width: 0; height: 100vh; overflow: auto; }

@media (max-width: 1080px) {
  .shell { grid-template-columns: 68px minmax(0, 1fr); }
  .sidebar { align-items: center; padding: 20px 10px 14px; }
  .logo { padding: 0; }
  .logo-name, .nav-link span, .profile-text { display: none; }
  .nav-link { width: 44px; justify-content: center; padding: 0; }
  .profile { flex-direction: column; padding: 12px 0 0; }
  .logout { margin-left: 0; }
}
</style>
