export const routes = [
  {
    path: '/fulfillments',
    name: 'fulfillments',
    component: () => import('./views/fulfillments.vue')
  },
  {
    path: '/fulfillments/:id',
    name: 'fulfillment-detail',
    component: () => import('./views/fulfillment-detail.vue')
  }
]
