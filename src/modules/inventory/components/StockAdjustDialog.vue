<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useInventory } from '../composables/useInventory'
import { useToast } from 'primevue/usetoast'

// Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'

// PROPS: What the parent sends us
const props = defineProps<{
    visible: boolean,
    product: any // The product object containing id, sku, snapshots, etc.
}>()

// EMITS: What we tell the parent
const emit = defineEmits(['update:visible', 'saved'])

const toast = useToast()
const { adjustStock, saving, loadLocations } = useInventory()
const locations = ref<any[]>([])

const form = ref({
    location_id: null as string | null,
    quantity: 0,
    reason: ''
})

// Fetch locations once when component loads
onMounted(async () => {
    locations.value = await loadLocations()
})

// Helper: Calculate stock for the selected location
const currentStock = computed(() => {
    if (!form.value.location_id || !props.product) return 0;
    
    // Look inside the product's snapshots
    const snapshots = props.product.inventory_snapshots || []
    const match = snapshots.find((s: any) => s.locations?.id === form.value.location_id || s.location_id === form.value.location_id)
    
    return match ? match.qoh : 0
})

const onSave = async () => {
    // 1. Validate Input
    if (!form.value.location_id || form.value.quantity === 0) {
        toast.add({ severity: 'warn', summary: 'Invalid', detail: 'Please select a location and quantity.', life: 3000 })
        return
    }

    // 2. Validate Negative Stock
    if (form.value.quantity < 0) {
        if (currentStock.value + form.value.quantity < 0) {
            toast.add({ 
                severity: 'error', 
                summary: 'Insufficient Stock', 
                detail: `Cannot remove ${Math.abs(form.value.quantity)}. Only ${currentStock.value} on hand.`, 
                life: 4000 
            })
            return
        }
    }

    const success = await adjustStock({
        product_id: props.product.id,
        location_id: form.value.location_id!,
        quantity_change: form.value.quantity,
        reason: form.value.reason,
        notes: ''
    })

    if (success) {
        // Reset form
        form.value = { location_id: null, quantity: 0, reason: '' }
        emit('saved')
        emit('update:visible', false)
    }
}
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="val => emit('update:visible', val)"
        modal 
        header="Adjust Inventory Level" 
        :style="{ width: '30rem' }"
        dismissableMask
    >
        <div class="flex flex-column gap-3 pt-2">
            <div class="flex flex-column gap-2">
                <label class="font-bold">Location</label>
                <Select 
                    v-model="form.location_id" 
                    :options="locations" 
                    optionLabel="name" 
                    optionValue="id" 
                    placeholder="Select Location" 
                    class="w-full"
                />
                <small v-if="form.location_id" class="text-blue-600 font-bold">
                    Current Stock: {{ currentStock }}
                </small>
            </div>

            <div class="flex flex-column gap-2">
                <label class="font-bold">Quantity Adjustment (+/-)</label>
                <InputNumber 
                    v-model="form.quantity" 
                    showButtons 
                    placeholder="e.g. 5 or -2"
                    inputClass="w-full"
                    class="w-full"
                    :min="form.location_id ? -currentStock : undefined"
                />
            </div>

            <div class="flex flex-column gap-2">
                <label class="font-bold">Reason / Notes</label>
                <Textarea v-model="form.reason" rows="2" placeholder="e.g. Found during cycle count" />
            </div>
        </div>

        <template #footer>
            <div class="flex w-full justify-content-between align-items-center">
                <small class="text-xs text-300">StockAdjustDialog.vue</small>
                <div class="flex gap-2">
                    <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
                    <Button label="Save Adjustment" icon="pi pi-check" @click="onSave" :loading="saving" />
                </div>
            </div>
        </template>
    </Dialog>
</template>