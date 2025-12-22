<script setup lang="ts">
import { ref, onMounted, onErrorCaptured } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import Drawer from 'primevue/drawer' // For mobile sidebar
import ErrorView from '@/modules/core/views/ErrorView.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const mobileMenuVisible = ref(false)
const globalError = ref<any>(null)

onErrorCaptured((err) => {
    console.error('Global Error Captured:', err)
    globalError.value = err
    return false // Prevent propagation
})

const resetError = () => {
    globalError.value = null
    router.push('/')
}

onMounted(() => {
    authStore.initialize()
    // Safety timeout: If auth takes too long, stop loading so user can at least see the app (or login screen)
    setTimeout(() => {
        if (authStore.loading) {
            console.warn('Auth initialization timed out, forcing app load.')
            authStore.loading = false
        }
    }, 5000)
})

const handleSignOut = async () => {
    await authStore.signOut()
    router.push('/login')
}

// Navigation Items
const items = ref([
    { 
        label: 'Main',
        items: [
            { label: 'Dashboard', icon: 'pi pi-home', route: '/' },
        ]
    },
    {
        label: 'Inventory',
        items: [
            { label: 'Products', icon: 'pi pi-box', route: '/products' },
            { label: 'Locations', icon: 'pi pi-map-marker', route: '/inventory/locations' },
            { label: 'Stock Ledger', icon: 'pi pi-book', route: '/dev/ledger' },
            { label: 'Import / Export', icon: 'pi pi-file-excel', route: '/inventory/import-export' },
        ]
    },
    {
        label: 'Sales',
        items: [
            { label: 'Sales Orders', icon: 'pi pi-shopping-cart', route: '/sales' },
            { label: 'Fulfillments', icon: 'pi pi-truck', route: '/fulfillments' },
        ]
    },
    {
        label: 'Purchasing',
        items: [
            { label: 'Purchase Orders', icon: 'pi pi-briefcase', route: '/purchases' },
            { label: 'Suppliers', icon: 'pi pi-users', route: '/suppliers' },
        ]
    },
    {
        label: 'Warehouse',
        items: [
            { label: 'Receipts', icon: 'pi pi-inbox', route: '/receipts' },
        ]
    },
    {
        label: 'Admin',
        items: [
            { label: 'General Settings', icon: 'pi pi-cog', route: '/settings' },
            { label: 'Shopify Integration', icon: 'pi pi-shopping-bag', route: '/settings/shopify' },
            { label: 'System Logs', icon: 'pi pi-exclamation-circle', route: '/dev/logs' },
        ]
    }
])
</script>

<template>
    <Toast position="top-right" :life="3000" />
    <ConfirmDialog />
    
    <div v-if="authStore.loading" class="flex align-items-center justify-content-center h-screen w-screen surface-ground">
        <div class="flex flex-column align-items-center gap-3">
            <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
            <div class="text-700 font-medium">Loading AldenOS...</div>
        </div>
    </div>

    <div v-else class="flex h-screen overflow-hidden surface-ground">
        
        <!-- Sidebar: Slightly darker (gray-100) for contrast -->
        <div v-if="authStore.isAuthenticated" class="hidden md:flex flex-column h-full bg-gray-100 border-right-1 surface-border shadow-2" style="width: 18rem; min-width: 18rem;">
            <div class="flex align-items-center justify-content-center p-4 border-bottom-1 surface-border h-5rem">
                <span class="text-xl font-bold text-900">AldenOS</span>
            </div>
            
            <div class="flex-1 overflow-y-auto p-3">
                <Menu :model="items" class="w-full border-none bg-transparent" 
                    :pt="{
                        submenuHeader: { class: 'text-900 font-bold text-xs uppercase mt-3 mb-2 px-3' }
                    }"
                >
                    <template #item="{ item, props }">
                        <router-link v-if="item.route" v-slot="{ href, navigate, isActive }" :to="item.route" custom>
                            <a :href="href" v-bind="props.action" @click="navigate; mobileMenuVisible = false" 
                               class="flex align-items-center py-2 px-3 border-round cursor-pointer transition-colors transition-duration-150 p-ripple mb-1 text-sm"
                               :class="[isActive ? 'bg-white text-primary shadow-1' : 'text-700 hover:bg-white hover:text-900']"
                            >
                                <span :class="[item.icon, isActive ? 'text-primary' : 'text-600']" />
                                <span class="ml-2 font-medium">{{ item.label }}</span>
                            </a>
                        </router-link>
                    </template>
                </Menu>
            </div>

            <div class="p-3 border-top-1 surface-border">
                <div class="flex align-items-center gap-3 p-2 border-round hover:surface-200 cursor-pointer transition-colors transition-duration-150">
                    <Avatar icon="pi pi-user" shape="circle" size="large" class="bg-primary text-white" />
                    <div class="flex flex-column overflow-hidden">
                        <span class="font-bold text-900 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ authStore.profile?.full_name || 'User' }}</span>
                        <span class="text-sm text-600 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ authStore.user?.email }}</span>
                    </div>
                    <i class="pi pi-sign-out ml-auto text-500 hover:text-900" title="Sign Out" @click="handleSignOut"></i>
                </div>
            </div>
        </div>

        <Drawer v-model:visible="mobileMenuVisible" header="AldenOS">
            <Menu :model="items" class="w-full border-none" />
        </Drawer>

        <div class="flex flex-column flex-1 h-full">
            
            <!-- Topbar: Slightly darker (gray-100) -->
            <div v-if="authStore.isAuthenticated" class="h-5rem bg-gray-100 border-bottom-1 surface-border flex align-items-center justify-content-between px-4 shadow-1 z-2">
                <div class="flex align-items-center gap-2">
                    <Button icon="pi pi-bars" text class="md:hidden" @click="mobileMenuVisible = true" />
                    <span class="text-lg font-medium text-700">Warehouse Management</span>
                </div>

                <div class="flex gap-2">
                     <Button icon="pi pi-bell" text rounded severity="secondary" />
                     <Button icon="pi pi-cog" text rounded severity="secondary" />
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4" style="font-size: 0.925rem">
                <ErrorView v-if="globalError" :error="globalError" :reset="resetError" />
                <RouterView v-else />
            </div>
        </div>
    </div>
</template>

<style>
/* Ensure the body fills the window so flexbox works */
body, html {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden; /* Prevent double scrollbars */
}
</style>