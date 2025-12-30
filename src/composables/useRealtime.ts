import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel, REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Composable for managing Supabase Realtime subscriptions
 * Provides automatic cleanup and error handling
 */
export function useRealtime() {
  const channel = ref<RealtimeChannel | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)

  const subscribe = (channelName: string, config: {
    table: string
    event?: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT | '*'
    filter?: string
    callback: (payload: any) => void
  }) => {
    // Cleanup existing subscription
    if (channel.value) {
      channel.value.unsubscribe()
    }

    try {
      channel.value = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as any,
          {
            event: config.event || '*',
            schema: 'public',
            table: config.table,
            filter: config.filter
          },
          (payload: any) => {
            config.callback(payload)
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            connected.value = true
            error.value = null
          } else if (status === 'CHANNEL_ERROR') {
            connected.value = false
            error.value = 'Failed to subscribe to realtime updates'
          }
        })
    } catch (e: any) {
      error.value = e.message
      logger.error('Realtime subscription error', e as Error)
    }
  }

  const unsubscribe = () => {
    if (channel.value) {
      channel.value.unsubscribe()
      channel.value = null
      connected.value = false
    }
  }

  return {
    channel,
    connected,
    error,
    subscribe,
    unsubscribe
  }
}
