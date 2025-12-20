<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useCommunication } from '../composables/useCommunication'
import { useUsers } from '../composables/useUsers'
import { formatDateTime } from '@/lib/formatDate'

// Tiptap
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import MentionList from './MentionList.vue'
import { VueRenderer } from '@tiptap/vue-3'

// PrimeVue
import Button from 'primevue/button'
import ScrollPanel from 'primevue/scrollpanel'
import Avatar from 'primevue/avatar'
import Tag from 'primevue/tag'

const props = defineProps<{
    entityId: string
    entityType: 'product' | 'sales_order' | 'purchase_order'
}>()

const { events, loading, postNote } = useCommunication(props.entityId, props.entityType)
const { searchUsers, users } = useUsers()

const editor = useEditor({
    extensions: [
        StarterKit,
        Mention.configure({
            HTMLAttributes: {
                class: 'mention',
            },
            suggestion: {
                items: async ({ query }) => {
                    await searchUsers(query)
                    return users.value
                },
                render: () => {
                    let component: any
                    let popup: any

                    return {
                        onStart: (props) => {
                            component = new VueRenderer(MentionList, {
                                props,
                                editor: props.editor,
                            })

                            if (!props.clientRect) {
                                return
                            }

                            popup = tippy(document.body, {
                                getReferenceClientRect: props.clientRect as any,
                                appendTo: () => document.body,
                                content: component.element,
                                showOnCreate: true,
                                interactive: true,
                                trigger: 'manual',
                                placement: 'bottom-start',
                            })
                        },
                        onUpdate(props) {
                            component.updateProps(props)

                            if (!props.clientRect) {
                                return
                            }

                            popup[0].setProps({
                                getReferenceClientRect: props.clientRect,
                            })
                        },
                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                popup[0].hide()
                                return true
                            }
                            return component.ref?.onKeyDown(props)
                        },
                        onExit() {
                            popup[0].destroy()
                            component.destroy()
                        },
                    }
                },
            },
        }),
    ],
    content: '',
    editorProps: {
        attributes: {
            class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none p-3 min-h-[100px]',
        },
    },
})

const submitNote = () => {
    if (!editor.value) return
    const html = editor.value.getHTML()
    // Check if empty (p tag only)
    if (editor.value.isEmpty) return
    
    postNote(html)
    editor.value.commands.clearContent()
}

onBeforeUnmount(() => {
    editor.value?.destroy()
})

const getInitials = (email: string) => {
    if (!email) return '?'
    return email.substring(0, 2).toUpperCase()
}
</script>

<template>
    <div class="flex flex-column h-full surface-border bg-surface-50">
        <!-- Header -->
        <div class="p-3 border-bottom-1 surface-border bg-white">
            <span class="font-bold text-lg">Timeline</span>
        </div>

        <!-- Feed -->
        <ScrollPanel class="flex-grow-1 p-3" style="min-height: 300px">
            <div v-if="loading" class="flex justify-content-center">
                <i class="pi pi-spin pi-spinner"></i>
            </div>
            
            <div v-else class="flex flex-column gap-3">
                <div v-for="event in events" :key="event.id" class="flex gap-3">
                    <!-- Avatar / Icon -->
                    <div class="flex-shrink-0">
                        <Avatar v-if="event.category === 'chat'" :label="getInitials(event.user_email || '')" shape="circle" class="bg-blue-100 text-blue-700" />
                        <div v-else class="w-2rem h-2rem border-circle bg-gray-100 flex align-items-center justify-content-center">
                            <i class="pi pi-cog text-gray-500 text-sm"></i>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="flex-grow-1">
                        <div class="flex align-items-center gap-2 mb-1">
                            <span v-if="event.category === 'chat'" class="font-bold text-sm">{{ event.user_email || 'Unknown' }}</span>
                            <span v-else class="font-bold text-sm text-gray-600">System</span>
                            <span class="text-xs text-gray-500">{{ formatDateTime(event.created_at) }}</span>
                        </div>
                        
                        <!-- Note Content -->
                        <div v-if="event.category === 'chat'" 
                             class="bg-white p-2 border-round shadow-1 text-sm" 
                             v-html="event.description">
                        </div>
                        
                        <!-- System Event -->
                        <div v-else class="text-sm text-gray-700">
                            <Tag :value="event.type" severity="secondary" class="mr-2 text-xs" />
                            {{ event.description }}
                        </div>
                    </div>
                </div>
                
                <div v-if="events.length === 0" class="text-center text-gray-500 mt-4">
                    No events yet.
                </div>
            </div>
        </ScrollPanel>

        <!-- Editor -->
        <div class="p-3 border-top-1 surface-border bg-white">
            <div class="border-1 surface-border border-round surface-ground overflow-hidden focus-within:border-primary transition-colors">
                <editor-content :editor="editor" />
            </div>
            <div class="flex justify-content-end mt-2">
                <Button label="Post Note" icon="pi pi-send" size="small" @click="submitNote" :disabled="editor?.isEmpty" />
            </div>
        </div>
    </div>
</template>

<style>
/* Tiptap Styles */
.ProseMirror {
    outline: none;
}
.ProseMirror p {
    margin: 0;
}
.mention {
    color: var(--primary-color);
    background-color: var(--primary-50);
    border-radius: 0.3rem;
    padding: 0.1rem 0.3rem;
}
</style>
