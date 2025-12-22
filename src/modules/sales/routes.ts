export const routes = [
  {
    path: '/sales',
    name: 'sales-orders',
    component: () => import('./views/sales-orders.vue')
  },
  {
    path: '/sales/:id',
    name: 'sales-order-detail',
    component: () => import('./views/sales-order-detail.vue')
  },
  {
    path: '/customers',
    name: 'customers',
    component: () => import('./views/customers.vue')
  }
]
