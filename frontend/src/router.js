import { createRouter, createWebHistory } from 'vue-router'
import { auth, homeRouteFor, onSessionExpired, SALES_ROLES } from './auth.js'
import AppLayout from './views/AppLayout.vue'
import ClientView from './views/ClientView.vue'
import HomeView from './views/HomeView.vue'
import InboxView from './views/InboxView.vue'
import LoginView from './views/LoginView.vue'
import RequestFormView from './views/RequestFormView.vue'
import UsersView from './views/UsersView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: 'Вход' } },
    // Демонстрационная страница сайта агентства с формой заявки (канал «Сайт»)
    { path: '/request', name: 'request', component: RequestFormView, meta: { public: true, title: 'Оставить заявку' } },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', name: 'home', component: HomeView, meta: { title: 'Главная' } },
        { path: 'inbox/:dealId(\\d+)?', name: 'inbox', component: InboxView, meta: { roles: SALES_ROLES, title: 'Входящие' } },
        { path: 'clients/:id(\\d+)', name: 'client', component: ClientView, meta: { roles: SALES_ROLES, title: 'Карточка клиента' } },
        { path: 'users', name: 'users', component: UsersView, meta: { roles: ['admin'], title: 'Пользователи' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await auth.restore()
  const user = auth.user

  if (to.name === 'login' && user) return homeRouteFor(user)
  if (to.meta.public) return true
  if (!user) return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  if (to.meta.roles && !to.meta.roles.includes(user.role)) return { name: 'home' }
  // У сотрудников продаж рабочий экран — «Входящие»
  if (to.name === 'home' && SALES_ROLES.includes(user.role)) return { name: 'inbox' }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'CRM'} — Агентство`
})

onSessionExpired(() => {
  router.replace({ name: 'login', query: { expired: '1' } })
})

export default router
