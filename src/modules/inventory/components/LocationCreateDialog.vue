<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'

// Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'

const props = defineProps<{
    visible: boolean
    locationToEdit?: any
}>()

const emit = defineEmits(['update:visible', 'saved'])
const toast = useToast()

const loading = ref(false)
const form = ref({
    name: '',
    description: '',
    is_sellable: true,
    is_default: false
})

watch(() => props.visible, (newVal) => {
    if (newVal) {
        if (props.locationToEdit) {
            form.value = { ...props.locationToEdit }
        } else {
            resetForm()
        }
    }
})

const resetForm = () => {
    form.value = {
        name: '',
        description: '',
        is_sellable: true,
        is_default: false
    }
}

const handleSave = async () => {
    if (!form.value.name) {
        toast.add({ severity: 'warn', summary: 'Validation Error', detail: 'Name is required.' })
        return
    }

    loading.value = true
    
    try {
        let query = supabase.from('locations')
        
        if (props.locationToEdit) {
            const { error } = await query
                .update(form.value)
                .eq('id', props.locationToEdit.id)
            if (error) throw error
        } else {
            const { error } = await query.insert(form.value)
            if (error) throw error
        }

        toast.add({ severity: 'success', summary: 'Success', detail: `Location ${props.locationToEdit ? 'updated' : 'created'}` })
        emit('saved')
        emit('update:visible', false)
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.message })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="$emit('update:visible', $event)"
        :header="locationToEdit ? 'Edit Location' : 'New Location'" 
        :modal="true" 
        :style="{ width: '450px' }"
    >
        <div class="flex flex-column gap-3">
            <div class="flex flex-column gap-2">
                <label for="name" class="font-bold">Name</label>
                <InputText id="name" v-model="form.name" autofocus />
            </div>

            <div class="flex flex-column gap-2">
                <label for="description" class="font-bold">Description</label>
                <Textarea id="description" v-model="form.description" rows="3" autoResize />
            </div>

            <div class="flex align-items-center gap-2">
                <Checkbox v-model="form.is_sellable" :binary="true" inputId="is_sellable" />
                <label for="is_sellable">Sellable (Stock available for orders)</label>
            </div>

            <div class="flex align-items-center gap-2">
                <Checkbox v-model="form.is_default" :binary="true" inputId="is_default" />
                <label for="is_default">Default Location</label>
            </div>
        </div>

        <template #footer>
            <Button label="Cancel" icon="pi pi-times" text @click="$emit('update:visible', false)" />
            <Button label="Save" icon="pi pi-check" @click="handleSave" :loading="loading" />
        </template>
    </Dialog>
</template>