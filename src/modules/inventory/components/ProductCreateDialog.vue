<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'

// Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'

const props = defineProps<{
    visible: boolean
}>()

const emit = defineEmits(['update:visible', 'created'])
const toast = useToast()

const loading = ref(false)
const form = ref({
    sku: '',
    name: '',
    description: '',
    list_price: 0,
    price_cost: 0
})

const resetForm = () => {
    form.value = {
        sku: '',
        name: '',
        description: '',
        list_price: 0,
        price_cost: 0
    }
}

const handleSave = async () => {
    if (!form.value.sku || !form.value.name) {
        toast.add({ severity: 'warn', summary: 'Validation Error', detail: 'SKU and Name are required.' })
        return
    }

    loading.value = true
    
    const { data, error } = await supabase
        .from('products')
        .insert({
            sku: form.value.sku,
            name: form.value.name,
            description: form.value.description,
            list_price: form.value.list_price,
            price_cost: form.value.price_cost
        })
        .select()
        .single()

    loading.value = false

    if (error) {
        console.error(error)
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } else {
        toast.add({ severity: 'success', summary: 'Success', detail: 'Product created successfully' })
        emit('created', data)
        emit('update:visible', false)
        resetForm()
    }
}

watch(() => props.visible, (newVal) => {
    if (!newVal) {
        // Optional: reset form on close? 
        // resetForm() 
    }
})
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="val => emit('update:visible', val)"
        modal 
        header="Create New Product" 
        :style="{ width: '40rem' }"
        dismissableMask
    >
        <div class="flex flex-column gap-4 py-2">
            <div class="flex flex-column gap-2">
                <label for="sku" class="font-bold">SKU <span class="text-red-500">*</span></label>
                <InputText id="sku" v-model="form.sku" placeholder="e.g. PROD-001" autofocus />
            </div>

            <div class="flex flex-column gap-2">
                <label for="name" class="font-bold">Product Name <span class="text-red-500">*</span></label>
                <InputText id="name" v-model="form.name" placeholder="e.g. Wireless Mouse" />
            </div>

            <div class="flex flex-column gap-2">
                <label for="description" class="font-bold">Description</label>
                <Textarea id="description" v-model="form.description" rows="3" autoResize />
            </div>

            <div class="formgrid grid">
                <div class="field col">
                    <label for="price_cost" class="font-bold">Cost Price</label>
                    <InputNumber 
                        id="price_cost" 
                        v-model="form.price_cost" 
                        mode="currency" 
                        currency="GBP" 
                        locale="en-GB" 
                        class="w-full"
                    />
                </div>
                <div class="field col">
                    <label for="list_price" class="font-bold">List Price</label>
                    <InputNumber 
                        id="list_price" 
                        v-model="form.list_price" 
                        mode="currency" 
                        currency="GBP" 
                        locale="en-GB" 
                        class="w-full"
                    />
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex w-full justify-content-between align-items-center">
                <small class="text-xs text-300">ProductCreateDialog.vue</small>
                <div class="flex gap-2">
                    <Button label="Cancel" text @click="emit('update:visible', false)" />
                    <Button label="Create Product" icon="pi pi-check" @click="handleSave" :loading="loading" />
                </div>
            </div>
        </template>
    </Dialog>
</template>
