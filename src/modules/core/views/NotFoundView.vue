<script setup lang="ts">
import Button from 'primevue/button'
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
    router.push('/')
}
</script>

<template>
    <div class="flex flex-column align-items-center justify-content-center min-h-screen surface-ground">
        <div class="surface-card p-6 shadow-2 border-round text-center" style="max-width: 500px">
            <div class="text-900 font-bold text-5xl mb-3">404</div>
            <div class="text-600 text-xl mb-5">Page Not Found</div>
            <p class="text-700 mb-5 line-height-3">
                The page you are looking for does not exist or has been moved.
            </p>
            <Button label="Go to Dashboard" icon="pi pi-home" @click="goHome" />
        </div>
    </div>
</template>
