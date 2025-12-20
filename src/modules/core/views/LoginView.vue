<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const router = useRouter()
const toast = useToast()

const email = ref('')
const password = ref('')
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })

  if (error) {
    toast.add({ severity: 'error', summary: 'Login Failed', detail: error.message, life: 3000 })
  } else {
    toast.add({ severity: 'success', summary: 'Welcome Back', detail: 'You have successfully logged in.', life: 3000 })
    router.push('/')
  }
  loading.value = false
}
</script>

<template>
  <div class="flex align-items-center justify-content-center min-h-screen surface-ground">
    <div class="surface-card p-4 shadow-2 border-round w-full lg:w-4">
      <div class="text-center mb-5">
        <div class="text-900 text-3xl font-medium mb-3">AldenOS</div>
        <span class="text-600 font-medium line-height-3">Don't have an account? Ask your admin.</span>
      </div>

      <div>
        <label for="email" class="block text-900 font-medium mb-2">Email</label>
        <InputText id="email" v-model="email" type="text" class="w-full mb-3" placeholder="user@alden.com" @keydown.enter="handleLogin" />

        <label for="password" class="block text-900 font-medium mb-2">Password</label>
        <Password id="password" v-model="password" class="w-full mb-3" :feedback="false" toggleMask placeholder="••••••••" @keydown.enter="handleLogin" :pt="{ input: { class: 'w-full' } }" />

        <div class="flex align-items-center justify-content-between mb-6">
          <div class="flex align-items-center">
            <!-- Remember me could go here -->
          </div>
          <a class="font-medium no-underline ml-2 text-blue-500 text-right cursor-pointer">Forgot password?</a>
        </div>

        <Button label="Sign In" icon="pi pi-user" class="w-full" :loading="loading" @click="handleLogin"></Button>
      </div>
    </div>
  </div>
</template>
