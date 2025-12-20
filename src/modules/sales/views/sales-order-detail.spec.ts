import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SalesOrderDetail from './sales-order-detail.vue'
import { createTestingPinia } from '@pinia/testing'
import PrimeVue from 'primevue/config'

// Mock dependencies
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '123' } }),
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: vi.fn() })
}))

// Mock the composable to control state
vi.mock('@/modules/sales/composables/useSalesOrder', () => ({
  useSalesOrder: () => ({
    hasAllocatedItems: { value: false },
    hasAllocatableStock: { value: true },
    isFullyAllocated: { value: false },
    calculatedTotal: { value: 100 },
    canUnallocateLine: () => true,
    canAllocateLine: () => true,
    // Add other methods used in onMounted or template
    fetchOrderData: vi.fn(),
    confirmOrder: vi.fn()
  })
}))

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: '123', status: 'draft' }, error: null }),
          order: () => ({ data: [], error: null })
        })
      })
    })
  }
}))

// Mock matchMedia for PrimeVue components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver for PrimeVue components (Textarea)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('SalesOrderDetailView', () => {
  it('renders correctly', () => {
    const wrapper = mount(SalesOrderDetail, {
      global: {
        plugins: [
          createTestingPinia(),
          PrimeVue
        ],
        directives: {
          tooltip: {}
        },
        stubs: {
          RouterLink: true,
          // Stub out complex PrimeVue components to simplify testing
          DataTable: true,
          Column: true,
          Panel: true,
          Dialog: true,
          ConfirmDialog: true,
          Textarea: true, // Fixes ResizeObserver error
          Calendar: true, // Fixes Deprecation warning
          // Stub custom components
          AddProductDialog: true,
          ProductAllocationDialog: true
        }
      }
    })

    expect(wrapper.exists()).toBe(true)
  })
})
