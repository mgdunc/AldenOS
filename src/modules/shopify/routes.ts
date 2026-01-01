export const routes = [
  {
    path: '/shopify',
    name: 'shopify-dashboard',
    component: () => import('./views/shopify-dashboard.vue'),
    meta: {
      title: 'Shopify Integration'
    }
  }
]
