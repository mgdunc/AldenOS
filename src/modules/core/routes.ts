import LoginView from './views/LoginView.vue'

export const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/settings.vue')
  },
  {
    path: '/dev/logs',
    name: 'system-logs',
    component: () => import('./views/system-logs.vue')
  },
  {
    path: '/dev/diagnostics',
    name: 'diagnostics',
    component: () => import('./views/diagnostics.vue')
  }
]
