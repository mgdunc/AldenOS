import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import { useRouter } from 'vue-router'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const profile = ref<any>(null)
  const loading = ref(true)
  const initialized = ref(false)
  const router = useRouter()

  const isAuthenticated = computed(() => !!session.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')

  async function initialize() {
    if (initialized.value) return
    
    loading.value = true
    
    try {
      // Get initial session
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      user.value = data.session?.user ?? null

      if (user.value) {
        await fetchProfile()
      }

      // Listen for changes
      supabase.auth.onAuthStateChange(async (_event, _session) => {
        session.value = _session
        user.value = _session?.user ?? null
        
        if (user.value) {
          await fetchProfile()
        } else {
          profile.value = null
        }
      })
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function fetchProfile() {
    if (!user.value) return
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .maybeSingle()
      
    if (!error && data) {
      profile.value = data
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    user.value = null
    profile.value = null
    // Router redirect is handled by the guard or component
  }

  return {
    session,
    user,
    profile,
    loading,
    initialized,
    isAuthenticated,
    isAdmin,
    initialize,
    signOut
  }
})
