import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'

export interface TimelineEvent {
    id: string
    created_at: string
    type: string // 'note', 'reserved', 'picking', etc.
    category: 'chat' | 'system'
    description: string
    user_id?: string
    user_email?: string // Joined manually
    entity_id: string
    entity_type: string
}

export function useCommunication(entityId: string, entityType: 'product' | 'sales_order' | 'purchase_order') {
    const events = ref<TimelineEvent[]>([])
    const loading = ref(true)
    const toast = useToast()
    let subscription: any = null

    const fetchTimeline = async () => {
        loading.value = true
        
        // 1. Fetch Events from View
        const { data, error } = await supabase
            .from('timeline_events')
            .select('*')
            .eq('entity_id', entityId)
            .eq('entity_type', entityType)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching timeline:', error)
            toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load timeline' })
        } else {
            // 2. Enrich with User Emails (for notes)
            // We do this client-side to avoid complex joins in the view for now, 
            // or we could join in the view if we had a profiles table.
            // We have profiles_view now.
            
            // Let's just fetch profiles for the user_ids we have
            const userIds = [...new Set(data.filter(e => e.user_id).map(e => e.user_id))]
            
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles_view')
                    .select('id, email')
                    .in('id', userIds)
                
                const profileMap = new Map(profiles?.map(p => [p.id, p.email]))
                
                events.value = data.map(e => ({
                    ...e,
                    user_email: e.user_id ? (profileMap.get(e.user_id) || 'Unknown User') : 'test@alden.com (Mock)'
                }))
            } else {
                // If no user IDs found (or all are null), map nulls to Mock
                events.value = data.map(e => ({
                    ...e,
                    user_email: e.user_id ? 'Unknown' : 'test@alden.com (Mock)'
                }))
            }
        }
        loading.value = false
    }

    const postNote = async (content: string) => {
        if (!content.trim()) return

        const { data: { user } } = await supabase.auth.getUser()
        
        // MOCK: If no user, use a dummy ID for local display, but send NULL to DB
        const userIdToSend = user ? user.id : null

        const payload: any = {
            content,
            user_id: userIdToSend
        }

        // Set the correct FK
        if (entityType === 'product') payload.product_id = entityId
        if (entityType === 'sales_order') payload.sales_order_id = entityId
        if (entityType === 'purchase_order') payload.purchase_order_id = entityId

        const { data, error } = await supabase.from('notes').insert(payload).select().single()

        if (error) {
            console.error('Error posting note:', error)
            toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to post note' })
        } else {
            // Optimistic update / Manual append
            // We append it manually to ensure it shows up immediately even if Realtime is slow/off
            const newEvent: TimelineEvent = {
                id: data.id,
                created_at: data.created_at,
                type: 'note',
                category: 'chat',
                description: content,
                user_id: userIdToSend || 'mock-user',
                user_email: user ? user.email : 'test@alden.com (Mock)',
                entity_id: entityId,
                entity_type: entityType
            }
            events.value = [newEvent, ...events.value]
            
            toast.add({ severity: 'success', summary: 'Posted', detail: 'Note added', life: 2000 })
        }
    }

    const subscribe = () => {
        // Subscribe to NOTES table for this entity
        // We can't easily subscribe to the VIEW.
        // So we subscribe to 'notes' and 'inventory_ledger' separately?
        // Or just 'notes' for chat, and assume system events trigger a reload or we don't need instant system updates.
        // Let's subscribe to 'notes' for now.
        
        const filterField = entityType === 'product' ? 'product_id' : 
                           entityType === 'sales_order' ? 'sales_order_id' : 'purchase_order_id'

        subscription = supabase
            .channel(`timeline:${entityId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notes', 
                filter: `${filterField}=eq.${entityId}` 
            }, () => {
                fetchTimeline() // Reload full timeline on new note
            })
            .subscribe()
    }

    onMounted(() => {
        fetchTimeline()
        subscribe()
    })

    onUnmounted(() => {
        if (subscription) supabase.removeChannel(subscription)
    })

    return {
        events,
        loading,
        postNote,
        fetchTimeline
    }
}
