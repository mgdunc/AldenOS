import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { logger } from '@/lib/logger'

// Module Routes
import { routes as coreRoutes } from '@/modules/core/routes'
import { routes as inventoryRoutes } from '@/modules/inventory/routes'
import { routes as salesRoutes } from '@/modules/sales/routes'
import { routes as fulfillmentRoutes } from '@/modules/fulfillment/routes'
import { routes as purchasingRoutes } from '@/modules/purchasing/routes'
import { routes as receivingRoutes } from '@/modules/receiving/routes'
import { routes as shopifyRoutes } from '@/modules/shopify/routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...coreRoutes,
    ...inventoryRoutes,
    ...salesRoutes,
    ...fulfillmentRoutes,
    ...purchasingRoutes,
    ...receivingRoutes,
    ...shopifyRoutes,
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/modules/core/views/NotFoundView.vue')
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Initialize auth if not already done (e.g. on page refresh)
  if (authStore.loading) {
    try {
      await authStore.initialize()
    } catch (error) {
      logger.error('Failed to initialize auth', error as Error)
    }
  }

  const isPublic = to.matched.some(record => record.meta.public)
  const isAuthenticated = authStore.isAuthenticated

  if (!isPublic && !isAuthenticated) {
    next({ name: 'login' })
  } else if (to.name === 'login' && isAuthenticated) {
    next({ name: 'dashboard' })
  } else {
    next()
  }
})

export default router