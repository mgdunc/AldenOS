export const routes = [
  {
    path: '/settings/shopify',
    name: 'shopify-settings',
    component: () => import('./views/ShopifySettingsView.vue')
  },
  {
    path: '/settings/shopify/queue',
    name: 'shopify-sync-queue',
    component: () => import('./views/ShopifySyncQueueView.vue')
  },
  {
    path: '/settings/shopify/queue/:id',
    name: 'shopify-sync-queue-detail',
    component: () => import('./views/ShopifySyncQueueDetail.vue')
  }
]
