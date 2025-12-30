<template>
  <div class="p-4">
    <Card>
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-cog"></i>
          <span>System Diagnostics</span>
        </div>
      </template>
      <template #content>
        <div class="flex flex-column gap-4">
          <!-- Environment Variables -->
          <div>
            <h3 class="text-lg font-semibold mb-3">Environment Variables</h3>
            <DataTable :value="envVars" class="p-datatable-sm">
              <Column field="name" header="Variable" style="width: 250px"></Column>
              <Column field="status" header="Status">
                <template #body="{ data }">
                  <Tag 
                    :value="data.status" 
                    :severity="data.status === 'Set' ? 'success' : 'danger'"
                  />
                </template>
              </Column>
              <Column field="preview" header="Preview">
                <template #body="{ data }">
                  <code class="text-sm">{{ data.preview }}</code>
                </template>
              </Column>
            </DataTable>
          </div>

          <!-- Supabase Connection -->
          <div>
            <h3 class="text-lg font-semibold mb-3">Supabase Connection</h3>
            <div class="flex flex-column gap-2">
              <div class="flex align-items-center gap-2">
                <span class="font-semibold">URL:</span>
                <code>{{ supabaseUrl || 'Not available' }}</code>
              </div>
              <div class="flex align-items-center gap-2">
                <span class="font-semibold">Status:</span>
                <Tag 
                  :value="supabaseStatus" 
                  :severity="supabaseStatus === 'Connected' ? 'success' : 'danger'"
                />
              </div>
              <Button 
                label="Test Connection" 
                icon="pi pi-refresh"
                @click="testSupabaseConnection"
                :loading="testingConnection"
                size="small"
              />
            </div>
          </div>

          <!-- Edge Function Test -->
          <div>
            <h3 class="text-lg font-semibold mb-3">Edge Function Test</h3>
            <div class="flex flex-column gap-2">
              <div class="flex align-items-center gap-2">
                <InputText 
                  v-model="testFunctionName" 
                  placeholder="Function name (e.g., shopify-order-sync)"
                  class="flex-1"
                />
                <Button 
                  label="Test Function" 
                  icon="pi pi-play"
                  @click="testEdgeFunction"
                  :loading="testingFunction"
                  :disabled="!testFunctionName"
                />
              </div>
              <div v-if="functionTestResult" class="mt-2">
                <Message 
                  :severity="functionTestResult.success ? 'success' : 'error'"
                  :closable="false"
                >
                  <div class="flex flex-column gap-1">
                    <div class="font-semibold">{{ functionTestResult.success ? 'Success' : 'Error' }}</div>
                    <div class="text-sm">{{ functionTestResult.message }}</div>
                    <pre v-if="functionTestResult.details" class="text-xs mt-2 p-2 surface-900 text-0 border-round overflow-auto" style="max-height: 200px">{{ JSON.stringify(functionTestResult.details, null, 2) }}</pre>
                  </div>
                </Message>
              </div>
            </div>
          </div>

          <!-- System Info -->
          <div>
            <h3 class="text-lg font-semibold mb-3">System Information</h3>
            <DataTable :value="systemInfo" class="p-datatable-sm">
              <Column field="key" header="Property" style="width: 200px"></Column>
              <Column field="value" header="Value">
                <template #body="{ data }">
                  <code class="text-sm">{{ data.value }}</code>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'

const envVars = ref<any[]>([])
const supabaseUrl = ref<string>('')
const supabaseStatus = ref<string>('Unknown')
const testingConnection = ref(false)
const testFunctionName = ref('shopify-order-sync')
const testingFunction = ref(false)
const functionTestResult = ref<any>(null)

const systemInfo = computed(() => [
  { key: 'Environment', value: import.meta.env.MODE },
  { key: 'Base URL', value: window.location.origin },
  { key: 'User Agent', value: navigator.userAgent.substring(0, 50) + '...' },
  { key: 'Timestamp', value: new Date().toISOString() }
])

const checkEnvironmentVariables = () => {
  const vars = [
    {
      name: 'VITE_SUPABASE_URL',
      value: import.meta.env.VITE_SUPABASE_URL,
      preview: import.meta.env.VITE_SUPABASE_URL 
        ? `${import.meta.env.VITE_SUPABASE_URL.substring(0, 30)}...` 
        : 'Not set'
    },
    {
      name: 'VITE_SUPABASE_ANON_KEY',
      value: import.meta.env.VITE_SUPABASE_ANON_KEY,
      preview: import.meta.env.VITE_SUPABASE_ANON_KEY 
        ? `${import.meta.env.VITE_SUPABASE_ANON_KEY.substring(0, 20)}...` 
        : 'Not set'
    }
  ]

  envVars.value = vars.map(v => ({
    name: v.name,
    status: v.value ? 'Set' : 'Missing',
    preview: v.preview
  }))

  // Get Supabase URL from client if available
  if ((supabase as any).supabaseUrl) {
    supabaseUrl.value = (supabase as any).supabaseUrl
  } else if (import.meta.env.VITE_SUPABASE_URL) {
    supabaseUrl.value = import.meta.env.VITE_SUPABASE_URL
  }
}

const testSupabaseConnection = async () => {
  testingConnection.value = true
  supabaseStatus.value = 'Testing...'
  
  try {
    // Try to get the current user (tests auth connection)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Try a simple query (tests database connection)
    const { error: dbError } = await supabase
      .from('system_logs')
      .select('id')
      .limit(1)
    
    if (authError && dbError) {
      supabaseStatus.value = 'Error'
      logger.error('Supabase connection test failed', { authError, dbError })
    } else {
      supabaseStatus.value = 'Connected'
    }
  } catch (error: any) {
    supabaseStatus.value = 'Error'
    logger.error('Supabase connection test error', error)
  } finally {
    testingConnection.value = false
  }
}

const testEdgeFunction = async () => {
  if (!testFunctionName.value) return
  
  testingFunction.value = true
  functionTestResult.value = null
  
  try {
    logger.debug('Testing Edge Function', { functionName: testFunctionName.value })
    
    const startTime = Date.now()
    const { data, error } = await supabase.functions.invoke(testFunctionName.value, {
      body: { test: true }
    })
    const duration = Date.now() - startTime
    
    if (error) {
      functionTestResult.value = {
        success: false,
        message: `Error: ${error.message}`,
        details: {
          errorName: error.name,
          errorMessage: error.message,
          errorStatus: (error as any).status,
          errorContext: error.context,
          duration: `${duration}ms`
        }
      }
      logger.error('Edge Function test failed', error)
    } else {
      functionTestResult.value = {
        success: true,
        message: `Function responded successfully in ${duration}ms`,
        details: {
          data,
          duration: `${duration}ms`
        }
      }
      logger.info('Edge Function test succeeded', { functionName: testFunctionName.value, duration })
    }
  } catch (error: any) {
    functionTestResult.value = {
      success: false,
      message: `Exception: ${error.message}`,
      details: {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        errorType: error.constructor.name
      }
    }
    logger.error('Edge Function test exception', error)
  } finally {
    testingFunction.value = false
  }
}

onMounted(() => {
  checkEnvironmentVariables()
  testSupabaseConnection()
})
</script>

