export const routes = [
  {
    path: '/receipts',
    name: 'receipts',
    component: () => import('./views/receipts.vue')
  },
  {
    path: '/receipts/create',
    name: 'receipt-create',
    component: () => import('./views/receipt-create.vue')
  },
  {
    path: '/receipts/:id',
    name: 'receipt-detail',
    component: () => import('./views/receipt-detail.vue')
  }
]
