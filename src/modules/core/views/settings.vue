<script setup lang="ts">
import { ref, onMounted } from 'vue'

const currencyOptions = [
  { code: 'GBP', label: 'Pound Sterling (£)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
]

const selectedCurrency = ref('GBP')

onMounted(() => {
  const saved = localStorage.getItem('app_currency')
  if (saved) selectedCurrency.value = saved
})

const saveCurrency = () => {
  localStorage.setItem('app_currency', selectedCurrency.value)
  window.location.reload() // reload to update all views
}
</script>

<template>
  <div class="card p-4 max-w-2xl mx-auto mt-6">
    <h2 class="text-2xl font-bold mb-4">App Settings</h2>
    <div class="mb-4">
      <label for="currency" class="block mb-2 font-semibold">Currency</label>
      <select id="currency" v-model="selectedCurrency" class="p-inputtext">
        <option v-for="opt in currencyOptions" :key="opt.code" :value="opt.code">
          {{ opt.label }}
        </option>
      </select>
    </div>
    <button class="p-button p-button-success" @click="saveCurrency">Save</button>

    <hr class="my-6 border-gray-300" />

    <h3 class="text-xl font-bold mb-3">Developer Tools</h3>
    <div class="flex gap-3 flex-wrap">
      <a href="http://localhost:51204/__vitest__/" target="_blank" class="p-button p-button-secondary no-underline">
        <i class="pi pi-check-circle mr-2"></i>
        Open Test Dashboard
      </a>
      <a href="http://localhost:54323" target="_blank" class="p-button p-button-secondary no-underline">
        <i class="pi pi-database mr-2"></i>
        Open Supabase Studio
      </a>
    </div>
    <p class="text-sm text-gray-500 mt-2">
      Note: Ensure <code>npm run test:ui</code> is running in your terminal.
    </p>
  </div>
</template>
