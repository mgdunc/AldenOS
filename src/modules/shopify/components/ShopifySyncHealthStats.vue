<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps<{
  integrationId?: string
}>()

const stats = ref<any>(null)
const loading = ref(true)

const loadStats = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .rpc('get_sync_health_stats', { 
        p_integration_id: props.integrationId || null 
      })

    if (error) throw error
    
    // If specific integration, get first row; otherwise aggregate
    if (props.integrationId && data?.length > 0) {
      stats.value = data[0]
    } else if (data?.length > 0) {
      // Aggregate all integrations
      stats.value = {
        total_syncs: data.reduce((sum: number, d: any) => sum + Number(d.total_syncs), 0),
        successful_syncs: data.reduce((sum: number, d: any) => sum + Number(d.successful_syncs), 0),
        failed_syncs: data.reduce((sum: number, d: any) => sum + Number(d.failed_syncs), 0),
        success_rate: data.length > 0 
          ? Math.round(data.reduce((sum: number, d: any) => sum + Number(d.successful_syncs), 0) / 
                       Math.max(1, data.reduce((sum: number, d: any) => sum + Number(d.successful_syncs) + Number(d.failed_syncs), 0)) * 100)
          : null,
        avg_duration_seconds: data.length > 0 
          ? Math.round(data.reduce((sum: number, d: any) => sum + (Number(d.avg_duration_seconds) || 0), 0) / data.length)
          : null,
        last_successful_sync: data.reduce((latest: string | null, d: any) => 
          !latest || (d.last_successful_sync && d.last_successful_sync > latest) ? d.last_successful_sync : latest, null),
        last_failed_sync: data.reduce((latest: string | null, d: any) => 
          !latest || (d.last_failed_sync && d.last_failed_sync > latest) ? d.last_failed_sync : latest, null)
      }
    }
  } catch (error: any) {
    console.error('Error loading sync health stats:', error)
  } finally {
    loading.value = false
  }
}

const successRateColor = computed(() => {
  if (!stats.value?.success_rate) return 'text-500'
  if (stats.value.success_rate >= 95) return 'text-green-500'
  if (stats.value.success_rate >= 80) return 'text-orange-500'
  return 'text-red-500'
})

const formatDuration = (seconds: number) => {
  if (!seconds) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
  
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffHours < 48) return 'Yesterday'
  return date.toLocaleDateString()
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="surface-card shadow-1 border-round p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div class="flex align-items-center gap-2">
        <i class="pi pi-heart-fill text-red-500"></i>
        <span class="font-semibold">Sync Health</span>
      </div>
      <span class="text-xs text-500">Last 30 days</span>
    </div>

    <div v-if="loading" class="flex justify-content-center py-3">
      <i class="pi pi-spin pi-spinner text-xl text-500"></i>
    </div>

    <div v-else-if="stats" class="grid">
      <!-- Success Rate -->
      <div class="col-6 md:col-3">
        <div class="text-center">
          <div class="text-2xl font-bold" :class="successRateColor">
            {{ stats.success_rate !== null ? `${stats.success_rate}%` : '-' }}
          </div>
          <div class="text-xs text-500">Success Rate</div>
        </div>
      </div>

      <!-- Total Syncs -->
      <div class="col-6 md:col-3">
        <div class="text-center">
          <div class="text-2xl font-bold text-primary">
            {{ stats.total_syncs || 0 }}
          </div>
          <div class="text-xs text-500">Total Syncs</div>
        </div>
      </div>

      <!-- Avg Duration -->
      <div class="col-6 md:col-3">
        <div class="text-center">
          <div class="text-2xl font-bold text-700">
            {{ formatDuration(stats.avg_duration_seconds) }}
          </div>
          <div class="text-xs text-500">Avg Duration</div>
        </div>
      </div>

      <!-- Failed -->
      <div class="col-6 md:col-3">
        <div class="text-center">
          <div class="text-2xl font-bold" :class="stats.failed_syncs > 0 ? 'text-red-500' : 'text-green-500'">
            {{ stats.failed_syncs || 0 }}
          </div>
          <div class="text-xs text-500">Failed</div>
        </div>
      </div>

      <!-- Last Successful -->
      <div class="col-6 border-top-1 surface-border pt-2 mt-2">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-check-circle text-green-500 text-sm"></i>
          <div>
            <div class="text-xs text-500">Last Success</div>
            <div class="text-sm font-semibold">{{ formatDate(stats.last_successful_sync) }}</div>
          </div>
        </div>
      </div>

      <!-- Last Failed -->
      <div class="col-6 border-top-1 surface-border pt-2 mt-2">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-times-circle text-red-500 text-sm"></i>
          <div>
            <div class="text-xs text-500">Last Failure</div>
            <div class="text-sm font-semibold">{{ formatDate(stats.last_failed_sync) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-500 py-3">
      <div class="text-sm">No sync data available</div>
    </div>
  </div>
</template>
