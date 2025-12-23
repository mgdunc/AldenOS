<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFulfillment } from '../composables/useFulfillment'
import { useFulfillmentStore } from '../store'
import { useResponsive } from '@/composables/useResponsive'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { storeToRefs } from 'pinia'

// PrimeVue
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

import { getStatusSeverity } from '@/lib/statusHelpers'
import { formatDate } from '@/lib/formatDate'

const router = useRouter()
const { loadFulfillments } = useFulfillment()
const store = useFulfillmentStore()
const { fulfillments, loading } = storeToRefs(store)
const { isMobile, isTablet } = useResponsive()
const { handleError } = useErrorHandler()

const fetchFulfillments = async () => {
    await loadFulfillments()
}

const navigateToDetail = (id: string) => {
    router.push(`/fulfillments/${id}`)
}

onMounted(() => {
    fetchFulfillments()
})
</script>

<template>
    <div class="flex flex-column gap-4">
        <div class="surface-card p-4 shadow-2 border-round flex justify-content-between align-items-center">
            <h1 class="text-3xl font-bold m-0">Fulfillments</h1>
            <Button icon="pi pi-refresh" label="Refresh" @click="fetchFulfillments" :loading="loading" />
        </div>

        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            <DataTable 
                :value="fulfillments" 
                stripedRows 
                :loading="loading" 
                paginator 
                :rows="10" 
                selectionMode="single" 
                @rowSelect="(e: any) => navigateToDetail(e.data.id)"
                :scrollable="!isMobile"
                responsiveLayout="scroll"
            >
                <template #empty>No fulfillments found.</template>
                
                <Column field="fulfillment_number" header="Fulfillment #" sortable class="font-bold" />
                
                <Column field="sales_orders.order_number" header="Order #" sortable>
                    <template #body="{ data }">
                        <span class="text-primary cursor-pointer hover:underline" @click.stop="router.push(`/sales/${data.sales_order_id}`)">
                            {{ data.sales_orders?.order_number }}
                        </span>
                    </template>
                </Column>
                
                <Column field="sales_orders.customer_name" header="Customer" sortable />
                
                <Column field="status" header="Status" sortable>
                    <template #body="{ data }">
                        <Tag :value="data.status?.toUpperCase()" :severity="getStatusSeverity(data.status)" />
                    </template>
                </Column>
                
                <Column field="created_at" header="Created" sortable>
                     <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
                </Column>

                <Column header="Action" style="width: 8rem">
                    <template #body="{ data }">
                        <Button icon="pi pi-angle-right" label="View" size="small" text @click="navigateToDetail(data.id)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>