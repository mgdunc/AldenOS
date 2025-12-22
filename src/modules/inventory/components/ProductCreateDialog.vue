<script setup lang="ts">
import { ref, watch } from 'vue'
import { useInventory } from '../composables/useInventory'
import type { Product } from '../types'

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
const { saving, createProduct } = useInventory()

const form = ref({
    sku: '',
    name: '',
    description: '',
    list_price: 0,
    cost: 0
})

const resetForm = () => {
    form.value = {
        sku: '',
        name: '',
        description: '',
        list_price: 0,
        cost: 0
    }
}

const handleSave = async () => {
    if (!form.value.sku || !form.value.name) {
        return
    }

    const product = await createProduct(form.value as Partial<Product>)
    
    if (product) {
        emit('created', product)
        emit('update:visible', false)
        resetForm()
    }
}

watch(() => props.visible, (newVal) => {
    if (!newVal) {
        // Optional: reset form on close
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
                    <label for="cost" class="font-bold">Cost Price</label>
                    <InputNumber 
                        id="cost" 
                        v-model="form.cost" 
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
                    <Button label="Create Product" icon="pi pi-check" @click="handleSave" :loading="saving" />
                </div>
            </div>
        </template>
    </Dialog>
</template>
