import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export function useUsers() {
    const users = ref<{ id: string, label: string }[]>([])

    const searchUsers = async (query: string) => {
        // In a real app, we'd search via RPC or filtered view.
        // Here we fetch from our profiles_view
        const { data } = await supabase
            .from('profiles_view')
            .select('id, email, full_name')
            .ilike('email', `%${query}%`)
            .limit(5)
        
        if (data && data.length > 0) {
            users.value = data.map(u => ({
                id: u.id,
                label: u.full_name || u.email || 'Unknown'
            }))
        } else {
            // MOCK DATA FOR TESTING
            const mockUsers = [
                { id: 'mock-1', label: 'Alice Manager (alice@alden.com)' },
                { id: 'mock-2', label: 'Bob Warehouse (bob@alden.com)' },
                { id: 'mock-3', label: 'Charlie Sales (charlie@alden.com)' }
            ]
            users.value = mockUsers.filter(u => u.label.toLowerCase().includes(query.toLowerCase()))
        }
    }

    return {
        users,
        searchUsers
    }
}
