<script setup lang="ts">
import { computed } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'

interface StatsCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon?: string
  iconColor?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  progress?: number
  format?: 'number' | 'currency' | 'percent'
  loading?: boolean
}

const props = withDefaults(defineProps<StatsCardProps>(), {
  format: 'number',
  loading: false
})

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value
  
  switch (props.format) {
    case 'currency':
      return formatCurrency(props.value)
    case 'percent':
      return `${props.value}%`
    default:
      return props.value.toLocaleString()
  }
})

const trendClass = computed(() => {
  if (!props.trend) return ''
  return props.trend.isPositive ? 'text-green-500' : 'text-red-500'
})

const trendIcon = computed(() => {
  if (!props.trend) return ''
  return props.trend.isPositive ? 'pi-arrow-up' : 'pi-arrow-down'
})
</script>

<template>
  <Card class="stats-card shadow-2">
    <template #content>
      <div class="flex flex-column gap-3">
        <!-- Header -->
        <div class="flex justify-content-between align-items-start">
          <div class="flex-1">
            <span class="block text-500 font-medium mb-2 text-sm">{{ title }}</span>
            <div v-if="loading" class="skeleton w-8rem h-2rem"></div>
            <div v-else class="text-900 font-bold text-3xl">{{ formattedValue }}</div>
          </div>
          <div 
            v-if="icon" 
            class="flex align-items-center justify-content-center border-round"
            :class="`bg-${iconColor || 'blue'}-100`"
            style="width: 3rem; height: 3rem;"
          >
            <i :class="`pi ${icon} text-xl`" :style="{ color: `var(--${iconColor || 'blue'}-500)` }"></i>
          </div>
        </div>

        <!-- Subtitle -->
        <div v-if="subtitle" class="text-500 text-sm">
          {{ subtitle }}
        </div>

        <!-- Trend -->
        <div v-if="trend && !loading" class="flex align-items-center gap-1">
          <i :class="`pi ${trendIcon} text-sm ${trendClass}`"></i>
          <span :class="`font-medium text-sm ${trendClass}`">
            {{ Math.abs(trend.value) }}%
          </span>
          <span class="text-500 text-sm ml-1">vs last period</span>
        </div>

        <!-- Progress -->
        <div v-if="progress !== undefined && !loading">
          <ProgressBar 
            :value="progress" 
            :showValue="false" 
            style="height: 6px"
          />
          <span class="text-xs text-500 mt-1">{{ progress }}% Complete</span>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.stats-card {
  height: 100%;
}

.stats-card :deep(.p-card-body) {
  padding: 1.25rem;
}

.stats-card :deep(.p-card-content) {
  padding: 0;
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
