export const routes = [
  {
    path: '/products',
    name: 'products',
    component: () => import('./views/products.vue')
  },
  {
    path: '/product/:id',
    name: 'product-detail',
    component: () => import('./views/product-detail.vue')
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
