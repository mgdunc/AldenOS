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
        // Get initial session with timeout
        console.log('Auth: Getting session...')
        const sessionPromise = supabase.auth.getSession()
        // Increased timeout to 10s to handle slower local environments or network latency
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timeout')), 10000)
        )
        
        const { data, error } = await Promise.race([sessionPromise, timeoutPromise])
          .catch(err => {
            console.warn('Auth: Session fetch failed or timed out:', err.message)
            return { data: { session: null }, error: err }
          }) as Awaited<typeof sessionPromise>
          
        if (error) {
            // Only log as error if it's not a timeout
            if (error.message !== 'Session fetch timeout') {
                console.error('Auth: Session error', error)
            }
        }
        
        session.value = data.session
        user.value = data.session?.user ?? null
        console.log('Auth: Session retrieved', user.value?.id)

        if (user.value) {
          console.log('Auth: Fetching profile...')
          await fetchProfile()
          console.log('Auth: Profile fetched')
        }

        // Listen for changes
        supabase.auth.onAuthStateChange(async (event, _session) => {
          console.log('Auth: State change', event)
          session.value = _session
          user.value = _session?.user ?? null
          
          if (user.value) {
            await fetchProfile()
          } else {
            profile.value = null
          }
        })
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
