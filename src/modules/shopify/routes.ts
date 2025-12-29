export const routes = [
  {
    path: '/settings/shopify',
    name: 'shopify-integrations',
    component: () => import('./views/ShopifyIntegrationsListView.vue')
  },
  {
    path: '/settings/shopify/new',
    name: 'shopify-integration-new',
    component: () => import('./views/ShopifyIntegrationDetailView.vue')
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
  },
  {
    path: '/settings/shopify/:id',
    name: 'shopify-integration-detail',
    component: () => import('./views/ShopifyIntegrationDetailView.vue')
  }
]
