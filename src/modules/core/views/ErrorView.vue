<script setup lang="ts">
import Button from 'primevue/button'

defineProps<{
    error?: any
    reset?: () => void
}>()

const reload = () => {
    window.location.href = '/'
}
</script>

<template>
    <div class="flex flex-column align-items-center justify-content-center min-h-screen surface-ground">
        <div class="surface-card p-6 shadow-2 border-round text-center" style="max-width: 600px">
            <i class="pi pi-exclamation-triangle text-red-500 text-6xl mb-4"></i>
            <div class="text-900 font-bold text-4xl mb-3">Something went wrong</div>
            <p class="text-700 mb-5 line-height-3">
                An unexpected error occurred. We've logged the issue and are looking into it.
            </p>
            
            <div v-if="error" class="surface-100 p-3 border-round mb-5 text-left overflow-auto" style="max-height: 200px">
                <code class="text-red-700 block mb-2">{{ error.message || error }}</code>
                <pre v-if="error.stack" class="text-xs text-600 m-0">{{ error.stack }}</pre>
            </div>

            <div class="flex gap-3 justify-content-center">
                <Button label="Reload Application" icon="pi pi-refresh" @click="reload" />
                <Button v-if="reset" label="Try Again" severity="secondary" @click="reset" />
            </div>
        </div>
    </div>
</template>
