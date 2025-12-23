<script setup lang="ts">
import ShopifySyncQueue from '../components/ShopifySyncQueue.vue'
</script>

<template>
  <div class="p-3">
    <div class="mb-3">
      <h2 class="text-2xl font-bold m-0 mb-1">Sync Queue</h2>
      <p class="text-sm text-600 m-0">Monitor and manage all sync jobs across your connected Shopify stores.</p>
    </div>
    
    <ShopifySyncQueue />
  </div>
</template>
