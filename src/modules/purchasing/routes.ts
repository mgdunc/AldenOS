export const routes = [
  {
    path: '/purchases',
    name: 'purchases-list',
    component: () => import('./views/purchase-orders.vue')
  },
  {
    path: '/purchases/:id',
    name: 'purchase-detail',
    component: () => import('./views/purchase-order-detail.vue')
  },
  {
    path: '/suppliers',
    name: 'suppliers',
    component: () => import('./views/suppliers.vue')
  }
]
