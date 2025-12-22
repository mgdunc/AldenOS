export const routes = [
  {
    path: '/settings/shopify',
    name: 'shopify-settings',
    component: () => import('./views/ShopifySettingsView.vue')
  }
]
