import DashboardView from './views/dashboard.vue'
import SettingsView from './views/settings.vue'
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
    component: DashboardView
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView
  },
  {
    path: '/dev/logs',
    name: 'system-logs',
    component: () => import('./views/system-logs.vue')
  }
]
