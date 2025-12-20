<script setup lang="ts">
import { formatCurrency } from '@/lib/formatCurrency'
// We will add charts/stats here later
</script>

<template>
    <div class="grid">
        <div class="col-12 md:col-6 lg:col-3">
            <div class="surface-card shadow-2 p-3 border-round">
                <div class="flex justify-content-between mb-3">
                    <div>
                        <span class="block text-500 font-medium mb-3">Total Value</span>
                        <div class="text-900 font-medium text-xl">{{ formatCurrency(0) }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-dollar text-blue-500 text-xl"></i>
                    </div>
                </div>
                <span class="text-green-500 font-medium">0 new </span>
                <span class="text-500">since last visit</span>
            </div>
        </div>
        <div class="col-12">
            <div class="card">
                <h5>Welcome to AldenOS</h5>
                <p>Use the menu above to manage Products or Receive Stock.</p>
            </div>
        </div>
    </div>
</template>