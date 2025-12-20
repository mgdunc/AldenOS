import SalesOrdersView from './views/sales-orders.vue'
import SalesOrderDetailView from './views/sales-order-detail.vue'

export const routes = [
  {
    path: '/sales',
    name: 'sales-orders',
    component: SalesOrdersView
  },
  {
    path: '/sales/:id',
    name: 'sales-order-detail',
    component: SalesOrderDetailView
  }
]
