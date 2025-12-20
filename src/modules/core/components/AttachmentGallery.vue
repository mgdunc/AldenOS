<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'

const props = defineProps<{
    modelValue: string | null, // The current URL stored in the database
    bucket: string,            // e.g., 'po-attachments' or 'so-attachments'
    folderId: string,          // The UUID of the record (e.g., poId)
    tableName: string,         // The table to update (e.g., 'purchase_orders')
    columnName: string         // The column to update (e.g., 'attachment_url')
}>()

const emit = defineEmits(['update:modelValue', 'saved'])
const toast = useToast()
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const getFileName = (url: string | null) => {
    if (!url) return ''
    const parts = url.split('/')
    return parts[parts.length - 1]
}

const triggerFileInput = () => fileInput.value?.click()

const onFileSelect = async (event: Event) => {
    const input = event.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return

    uploading.value = true
    const file = input.files[0] as File
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${props.folderId}/${sanitizedName}`

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from(props.bucket)
        .upload(filePath, file, { upsert: true })

    if (uploadError) {
        toast.add({ severity: 'error', summary: 'Upload Failed', detail: uploadError.message })
    } else {
        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage.from(props.bucket).getPublicUrl(filePath)

        // 3. Update Database Record
        const { error: dbError } = await supabase
            .from(props.tableName)
            .update({ [props.columnName]: publicUrl })
            .eq('id', props.folderId)

        if (dbError) {
            toast.add({ severity: 'error', summary: 'DB Update Failed', detail: dbError.message })
        } else {
            toast.add({ severity: 'success', summary: 'Success', detail: 'File attached.' })
            emit('update:modelValue', publicUrl)
            emit('saved')
        }
    }
    input.value = ''
    uploading.value = false
}

const removeAttachment = async () => {
    if (!confirm("Remove this attachment?")) return

    const { error } = await supabase
        .from(props.tableName)
        .update({ [props.columnName]: null })
        .eq('id', props.folderId)

    if (!error) {
        toast.add({ severity: 'success', summary: 'Removed', detail: 'Attachment unlinked.' })
        emit('update:modelValue', null)
        emit('saved')
    }
}
</script>

<template>
    <div class="flex align-items-center gap-4">
        <input type="file" ref="fileInput" class="hidden" accept=".pdf,.png,.jpg,.jpeg" @change="onFileSelect" />
        
        <div v-if="modelValue" class="flex align-items-center gap-3 p-2 border-round surface-100 border-1 surface-border">
            <div class="flex flex-column pr-3">
                <span class="font-bold text-sm text-900 line-height-2">Attachment</span>
                <span class="text-xs text-500 white-space-nowrap overflow-hidden text-overflow-ellipsis" style="max-width: 150px;">
                    {{ getFileName(modelValue) }}
                </span>
            </div>
            <div class="flex gap-1">
                <a :href="modelValue" target="_blank" class="no-underline">
                    <Button icon="pi pi-external-link" size="small" text rounded v-tooltip.top="'View File'" />
                </a>
                <Button icon="pi pi-trash" severity="danger" size="small" text rounded @click="removeAttachment" v-tooltip.top="'Remove'" />
            </div>
        </div>

        <div v-else class="text-500 flex align-items-center gap-3">
            <i class="pi pi-file text-2xl"></i>
            <span class="text-sm">No files attached.</span>
            <Button label="Upload" icon="pi pi-upload" size="small" outlined severity="secondary" @click="triggerFileInput" :loading="uploading" />
        </div>
    </div>
</template>