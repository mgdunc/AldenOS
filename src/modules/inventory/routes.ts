import ProductsView from './views/products.vue'
import ProductDetailView from './views/product-detail.vue'

export const routes = [
  {
    path: '/products',
    name: 'products',
    component: ProductsView
  },
  {
    path: '/product/:id',
    name: 'product-detail',
    component: ProductDetailView
  },
  {
    path: '/inventory/locations',
    name: 'locations',
    component: () => import('./views/LocationsView.vue')
  },
  {
    path: '/inventory/import-export',
    name: 'inventory-import-export',
    component: () => import('./views/ImportExportView.vue')
  },
  {
    path: '/inventory/locations/:id',
    name: 'location-detail',
    component: () => import('./views/LocationDetailView.vue')
  },
  {
    path: '/dev/ledger',
    name: 'inventory-ledger',
    component: () => import('./views/inventory-ledger.vue')
  }
]
