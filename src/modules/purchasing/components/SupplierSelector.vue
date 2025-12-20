<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import Select from 'primevue/select' // Change to Dropdown if on PrimeVue v3

const props = defineProps<{
    modelValue: string | null | undefined,
    placeholder?: string,
    invalid?: boolean
}>()

const emit = defineEmits(['update:modelValue', 'change'])

const suppliers = ref<any[]>([])
const loading = ref(false)

const fetchSuppliers = async () => {
    loading.value = true
    const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name')
    
    if (!error) {
        suppliers.value = data || []
    }
    loading.value = false
}

const onChange = (event: any) => {
    emit('update:modelValue', event.value)
    emit('change', event.value)
}

onMounted(fetchSuppliers)
</script>

<template>
    <Select
        :modelValue="modelValue"
        :options="suppliers"
        optionLabel="name"
        optionValue="id"
        :placeholder="placeholder || 'Select a Supplier'"
        :loading="loading"
        :invalid="invalid"
        filter
        class="w-full"
        @change="onChange"
    >
        <template #option="slotProps">
            <div class="flex align-items-center">
                <i class="pi pi-truck mr-2 text-500"></i>
                <div>{{ slotProps.option.name }}</div>
            </div>
        </template>
    </Select>
</template>