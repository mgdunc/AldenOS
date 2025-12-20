<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
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
const locations = ref<any[]>([])
const saving = ref(false)

const form = ref({
    location_id: null as string | null,
    quantity: 0,
    reason: ''
})

// Fetch locations once when component loads
onMounted(async () => {
    const { data } = await supabase.from('locations').select('id, name').order('name')
    locations.value = data || []
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

    saving.value = true

   // CALL THE RPC FUNCTION
const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: props.product.id,
    p_location_id: form.value.location_id,
    p_quantity: form.value.quantity,
    p_reason: form.value.reason
});

if (error) {
    console.error(error);
    // The error message from the database ("Insufficient stock...") appears here
    toast.add({ severity: 'error', summary: 'Failed', detail: error.message });
} else {
    toast.add({ severity: 'success', summary: 'Updated', detail: 'Stock adjusted successfully.' });
    emit('update:visible', false);
    emit('saved');
    form.value = { location_id: null, quantity: 0, reason: '' };
}

    if (error) {
        console.error(error)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to adjust stock.' })
    } else {
        toast.add({ severity: 'success', summary: 'Updated', detail: 'Stock adjusted successfully.' })
        
        // Close dialog and tell parent to reload
        emit('update:visible', false)
        emit('saved')
        
        // Reset form
        form.value = { location_id: null, quantity: 0, reason: '' }
    }
    saving.value = false
}
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="val => emit('update:visible', val)"
        modal 
        header="Adjust Inventory Level" 
        :style="{ width: '30rem' }"
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
                    :min="form.location_id ? -currentStock : null"
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