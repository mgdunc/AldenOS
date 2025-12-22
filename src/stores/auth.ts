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
  
  // Promise to track initialization in progress
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!session.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')

  async function initialize() {
    if (initialized.value) return
    if (initPromise) return initPromise
    
    console.log('Auth: Initializing...')
    loading.value = true
    
    initPromise = (async () => {
      try {
        console.log('Auth: Initializing via onAuthStateChange...')
        
        // Use onAuthStateChange to get the initial session. 
        // This is often more reliable than getSession() which can hang in some environments.
        // The callback is fired immediately with the current session (from storage).
        
        const initComplete = new Promise<void>((resolve) => {
            let resolved = false
            
            supabase.auth.onAuthStateChange(async (event, _session) => {
                console.log('Auth: State change', event)
                session.value = _session
                user.value = _session?.user ?? null
                
                // Resolve the initialization promise immediately on the first event
                // We do NOT wait for profile fetching to avoid blocking the app load
                if (!resolved) {
                    resolved = true
                    resolve()
                }

                if (user.value) {
                    if (!profile.value) {
                        // Fetch profile in background
                        fetchProfile().catch(err => console.error('Auth: Profile fetch failed', err))
                    }
                } else {
                    profile.value = null
                }
            })
        })

        // Race with timeout (10s)
        const timeoutPromise = new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Auth initialization timeout')), 10000)
        )
        
        await Promise.race([initComplete, timeoutPromise])

      } catch (e) {
        console.error('Auth: Initialization failed', e)
      } finally {
        console.log('Auth: Initialization complete')
        loading.value = false
        initialized.value = true
        initPromise = null
      }
    })()

    return initPromise
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
