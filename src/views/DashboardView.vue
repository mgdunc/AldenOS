<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useResponsive } from '@/composables/useResponsive'
import StatsCard from '@/components/StatsCard.vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import { supabase } from '@/lib/supabase'

interface Stats {
  total_products: number
  total_value: number
  out_of_stock_count: number
  low_stock_count: number
  total_revenue: number
  pending_orders: number
  fulfilled_orders: number
  active_pos: number
  total_po_value: number
}

const { getGridCols, isMobile } = useResponsive()

const loading = ref(true)
const stats = ref<Stats>({
  total_products: 0,
  total_value: 0,
  out_of_stock_count: 0,
  low_stock_count: 0,
  total_revenue: 0,
  pending_orders: 0,
  fulfilled_orders: 0,
  active_pos: 0,
  total_po_value: 0
})

const loadDashboardData = async () => {
  loading.value = true
  try {
    // Load products from inventory view (includes calculated inventory levels)
    const { data: products } = await supabase
      .from('product_inventory_view')
      .select('available, cost_price')
    
    if (products) {
      stats.value.total_products = products.length
      stats.value.total_value = products.reduce((sum, p) => sum + ((p.available || 0) * (p.cost_price || 0)), 0)
      stats.value.out_of_stock_count = products.filter(p => (p.available || 0) <= 0).length
      stats.value.low_stock_count = products.filter(p => (p.available || 0) > 0 && (p.available || 0) <= 10).length
    }

    // Load sales orders
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('status, total')
    
    if (orders) {
      stats.value.total_revenue = orders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (o.total || 0), 0)
      stats.value.pending_orders = orders.filter(o => o.status === 'draft' || o.status === 'confirmed').length
      stats.value.fulfilled_orders = orders.filter(o => o.status === 'fulfilled').length
    }

    // Load purchase orders
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('status, total')
    
    if (pos) {
      stats.value.active_pos = pos.filter(p => p.status === 'submitted').length
      stats.value.total_po_value = pos.reduce((sum, p) => sum + (p.total || 0), 0)
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDashboardData()
})

const gridCols = computed(() => getGridCols(4, 2, 1))
</script>

<template>
  <div>
    <div class="flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="text-3xl font-bold text-900 m-0">Dashboard</h1>
        <p class="text-600 mt-2">Overview of your warehouse operations</p>
      </div>
      <Button 
        icon="pi pi-refresh" 
        label="Refresh" 
        :loading="loading"
        @click="loadDashboardData"
        severity="secondary"
      />
    </div>

    <!-- Inventory Section -->
    <div class="mb-5">
      <h2 class="text-xl font-semibold text-900 mb-3">Inventory</h2>
      <div class="grid">
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Total Products"
            :value="stats.total_products"
            icon="pi-box"
            icon-color="blue"
            :loading="loading"
            subtitle="Active SKUs"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Inventory Value"
            :value="stats.total_value"
            format="currency"
            icon="pi-dollar"
            icon-color="green"
            :loading="loading"
            subtitle="Total stock value"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Out of Stock"
            :value="stats.out_of_stock_count"
            icon="pi-exclamation-triangle"
            icon-color="red"
            :loading="loading"
            subtitle="Needs attention"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Low Stock"
            :value="stats.low_stock_count"
            icon="pi-exclamation-circle"
            icon-color="orange"
            :loading="loading"
            subtitle="Below threshold"
          />
        </div>
      </div>
    </div>

    <!-- Sales Section -->
    <div class="mb-5">
      <h2 class="text-xl font-semibold text-900 mb-3">Sales</h2>
      <div class="grid">
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Total Revenue"
            :value="stats.total_revenue"
            format="currency"
            icon="pi-chart-line"
            icon-color="green"
            :loading="loading"
            :trend="{ value: 12, isPositive: true }"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Pending Orders"
            :value="stats.pending_orders"
            icon="pi-clock"
            icon-color="orange"
            :loading="loading"
            subtitle="Awaiting fulfillment"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Fulfilled Orders"
            :value="stats.fulfilled_orders"
            icon="pi-check-circle"
            icon-color="green"
            :loading="loading"
            subtitle="Completed"
          />
        </div>
        <div class="col-12" :class="`md:col-${12 / gridCols}`">
          <StatsCard
            title="Avg Order Value"
            :value="(stats.pending_orders + stats.fulfilled_orders) > 0 ? stats.total_revenue / (stats.pending_orders + stats.fulfilled_orders) : 0"
            format="currency"
            icon="pi-calculator"
            icon-color="blue"
            :loading="loading"
          />
        </div>
      </div>
    </div>

    <!-- Purchasing Section -->
    <div class="mb-5">
      <h2 class="text-xl font-semibold text-900 mb-3">Purchasing</h2>
      <div class="grid">
        <div class="col-12 md:col-6">
          <StatsCard
            title="Active Purchase Orders"
            :value="stats.active_pos"
            icon="pi-shopping-cart"
            icon-color="purple"
            :loading="loading"
            subtitle="In progress"
          />
        </div>
        <div class="col-12 md:col-6">
          <StatsCard
            title="Total PO Value"
            :value="stats.total_po_value"
            format="currency"
            icon="pi-money-bill"
            icon-color="indigo"
            :loading="loading"
            subtitle="Outstanding orders"
          />
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <Card v-if="!isMobile()">
      <template #title>Quick Actions</template>
      <template #content>
        <div class="flex gap-3 flex-wrap">
          <Button 
            label="New Product" 
            icon="pi pi-plus" 
            severity="success"
            @click="$router.push('/products')"
          />
          <Button 
            label="New Sales Order" 
            icon="pi pi-file" 
            severity="info"
            @click="$router.push('/sales')"
          />
          <Button 
            label="New Purchase Order" 
            icon="pi pi-shopping-bag" 
            severity="secondary"
            @click="$router.push('/purchases')"
          />
          <Button 
            label="Stock Adjustment" 
            icon="pi pi-arrow-right-arrow-left" 
            severity="warning"
            @click="$router.push('/products')"
          />
        </div>
      </template>
    </Card>
  </div>
</template>
