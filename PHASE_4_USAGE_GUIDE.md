# Phase 4 Features - Usage Guide

This guide shows how to use the new features added in Phase 4.

---

## 🚨 Error Handling

### ErrorBoundary Component

Wrap any component that might throw errors:

```vue
<template>
  <ErrorBoundary>
    <!-- Any component that might error -->
    <ComplexDataView />
  </ErrorBoundary>
</template>

<script setup lang="ts">
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>
```

**Features:**
- Catches all errors in child components
- Shows user-friendly error message
- Provides "Retry" button to reload
- Shows stack trace in development

### useErrorHandler Composable

For handling errors in your composables and components:

```typescript
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError, handleAsyncError, wrapAsync } = useErrorHandler()

// Option 1: Manual error handling
try {
  const { data, error } = await supabase.from('products').select()
  if (error) throw error
} catch (err) {
  handleError(err, 'Failed to load products')
}

// Option 2: Async error handling (returns undefined on error)
const data = await handleAsyncError(
  async () => {
    const { data, error } = await supabase.from('products').select()
    if (error) throw error
    return data
  },
  'Failed to load products'
)

// Option 3: Wrap async function (cleanest!)
const loadProducts = wrapAsync(async () => {
  const { data, error } = await supabase.from('products').select()
  if (error) throw error
  return data
}, 'Failed to load products')

// Usage:
await loadProducts() // Automatically handles errors with toast
```

---

## 🔍 Global Search

### Using Global Search

The search is already integrated in `App.vue` topbar.

**Keyboard Shortcuts:**
- Mac: `⌘ + K`
- Windows/Linux: `Ctrl + K`

**Or click the "Search" button in the topbar.**

### Search Features:
- Searches across Products, Sales Orders, Purchase Orders, Customers, Suppliers
- Shows categorized results with icons
- Click any result to navigate to detail page
- Real-time debounced search (300ms)

### Programmatic Usage:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useGlobalSearch } from '@/composables/useGlobalSearch'

const searchQuery = ref('')
const { results, isSearching, search } = useGlobalSearch()

// Perform search
const handleSearch = async () => {
  await search(searchQuery.value)
  console.log(results.value) // Array of SearchResult[]
}
</script>

<template>
  <InputText v-model="searchQuery" @input="handleSearch" />
  <div v-if="isSearching">Searching...</div>
  <div v-for="result in results" :key="result.id">
    {{ result.title }} - {{ result.type }}
  </div>
</template>
```

---

## 📱 Mobile-Responsive Utilities

### useResponsive Composable

Detect device type and screen size:

```vue
<script setup lang="ts">
import { useResponsive } from '@/composables/useResponsive'

const {
  // State
  windowWidth,
  windowHeight,
  breakpoints, // { xs, sm, md, lg, xl }
  
  // Methods
  isMobile,      // () => boolean
  isTablet,      // () => boolean
  isDesktop,     // () => boolean
  isTouch,       // () => boolean
  currentBreakpoint, // () => 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  
  // Helpers
  getGridCols,   // (desktop, tablet, mobile) => number
  getTableRows   // (desktop, mobile) => number
} = useResponsive()
</script>

<template>
  <!-- Show/hide based on device -->
  <div v-if="isMobile()">Mobile View</div>
  <div v-else>Desktop View</div>
  
  <!-- Current breakpoint -->
  <p>Screen: {{ currentBreakpoint() }}</p>
  
  <!-- Touch device detection -->
  <Button v-if="isTouch()" @click="handleTouch">Tap Me</Button>
</template>
```

### Responsive Grid Columns:

```vue
<script setup>
import { computed } from 'vue'
import { useResponsive } from '@/composables/useResponsive'

const { getGridCols } = useResponsive()

// 4 cols on desktop, 2 on tablet, 1 on mobile
const cols = computed(() => getGridCols(4, 2, 1))
</script>

<template>
  <div class="grid">
    <div v-for="item in items" :class="`col-12 md:col-${12 / cols}`">
      <Card>{{ item.name }}</Card>
    </div>
  </div>
</template>
```

### Responsive Table Rows:

```vue
<script setup>
import { computed } from 'vue'
import { useResponsive } from '@/composables/useResponsive'

const { getTableRows } = useResponsive()

// Show 50 rows on desktop, 10 on mobile
const rows = computed(() => getTableRows(50, 10))
</script>

<template>
  <DataTable :value="products" :rows="rows" :paginator="true">
    <!-- columns -->
  </DataTable>
</template>
```

---

## 📊 Dashboard & Stats Cards

### StatsCard Component

Reusable KPI card for displaying metrics:

```vue
<template>
  <StatsCard
    title="Total Revenue"
    :value="12500"
    format="currency"
    icon="pi-dollar"
    icon-color="green"
    :loading="false"
    subtitle="Last 30 days"
    :trend="{ value: 15, isPositive: true }"
    :progress="75"
  />
</template>

<script setup lang="ts">
import StatsCard from '@/components/StatsCard.vue'
</script>
```

**Props:**
- `title` (string, required) - Card title
- `value` (number | string, required) - Main value to display
- `format` ('number' | 'currency' | 'percent') - How to format value
- `icon` (string) - PrimeIcons icon class (e.g., 'pi-dollar')
- `icon-color` (string) - Color theme (blue, green, red, orange, etc.)
- `loading` (boolean) - Show skeleton loader
- `subtitle` (string) - Additional context text
- `trend` ({ value: number, isPositive: boolean }) - Trend indicator
- `progress` (number, 0-100) - Progress bar percentage

**Examples:**

```vue
<!-- Currency -->
<StatsCard
  title="Total Sales"
  :value="45600"
  format="currency"
  icon="pi-shopping-cart"
  icon-color="green"
/>

<!-- Percentage -->
<StatsCard
  title="Completion Rate"
  :value="87"
  format="percent"
  icon="pi-check-circle"
  icon-color="blue"
/>

<!-- With Trend -->
<StatsCard
  title="Active Users"
  :value="1250"
  icon="pi-users"
  icon-color="indigo"
  :trend="{ value: 8, isPositive: true }"
/>

<!-- With Progress -->
<StatsCard
  title="Project Progress"
  :value="45"
  format="percent"
  icon="pi-chart-bar"
  icon-color="purple"
  :progress="45"
/>

<!-- Loading State -->
<StatsCard
  title="Loading Data"
  :value="0"
  :loading="true"
/>
```

### Custom Dashboard Section:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import StatsCard from '@/components/StatsCard.vue'
import { supabase } from '@/lib/supabase'

const loading = ref(true)
const stats = ref({
  total: 0,
  active: 0,
  pending: 0
})

onMounted(async () => {
  const { data } = await supabase.from('your_table').select('*')
  stats.value.total = data?.length || 0
  // ... calculate other stats
  loading.value = false
})
</script>

<template>
  <div class="mb-5">
    <h2 class="text-xl font-semibold text-900 mb-3">Your Section</h2>
    <div class="grid">
      <div class="col-12 md:col-4">
        <StatsCard
          title="Total"
          :value="stats.total"
          :loading="loading"
          icon="pi-box"
          icon-color="blue"
        />
      </div>
      <div class="col-12 md:col-4">
        <StatsCard
          title="Active"
          :value="stats.active"
          :loading="loading"
          icon="pi-check"
          icon-color="green"
        />
      </div>
      <div class="col-12 md:col-4">
        <StatsCard
          title="Pending"
          :value="stats.pending"
          :loading="loading"
          icon="pi-clock"
          icon-color="orange"
        />
      </div>
    </div>
  </div>
</template>
```

---

## 🧪 Unit Testing

### Running Tests:

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run specific test file
npm run test useInventory.spec.ts
```

### Writing Tests:

**Example: Testing a Composable**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMockSupabase, createSuccessResponse } from '@/test/utils'
import { useYourComposable } from './useYourComposable'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: createMockSupabase().client
}))

describe('useYourComposable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should load data successfully', async () => {
    const mockData = [{ id: '1', name: 'Test' }]
    
    // Setup mock
    const { mocks } = createMockSupabase()
    mocks.select.mockResolvedValue(createSuccessResponse(mockData))

    // Call composable
    const { loadData } = useYourComposable()
    const result = await loadData()

    // Assert
    expect(result).toEqual(mockData)
    expect(mocks.from).toHaveBeenCalledWith('your_table')
  })

  it('should handle errors gracefully', async () => {
    const { mocks } = createMockSupabase()
    mocks.select.mockResolvedValue({ 
      data: null, 
      error: { message: 'Error' } 
    })

    const { loadData } = useYourComposable()
    const result = await loadData()

    expect(result).toEqual([])
  })
})
```

**Example: Testing a Store**

```typescript
import { useYourStore } from './store'

describe('useYourStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should compute stats correctly', () => {
    const store = useYourStore()
    
    store.setItems([
      { id: '1', status: 'active', value: 100 },
      { id: '2', status: 'inactive', value: 50 }
    ])

    expect(store.stats.total).toBe(2)
    expect(store.stats.active_count).toBe(1)
    expect(store.stats.total_value).toBe(150)
  })

  it('should filter items', () => {
    const store = useYourStore()
    store.setItems([
      { id: '1', name: 'Apple' },
      { id: '2', name: 'Banana' }
    ])

    store.setFilters({ search: 'app' })

    expect(store.filteredItems).toHaveLength(1)
    expect(store.filteredItems[0].name).toBe('Apple')
  })
})
```

---

## 🎨 Color Themes for Icons

Available `icon-color` values for StatsCard:

- `blue` - Primary/info
- `green` - Success
- `red` - Danger/error
- `orange` - Warning
- `purple` - Secondary
- `indigo` - Alternative primary
- `yellow` - Attention
- `teal` - Neutral positive
- `pink` - Alternative accent
- `cyan` - Info alternative

---

## 📐 PrimeFlex Grid Reference

```vue
<!-- Full width -->
<div class="col-12">Content</div>

<!-- Half width on all screens -->
<div class="col-6">Content</div>

<!-- Responsive columns -->
<div class="col-12 md:col-6 lg:col-4">
  <!-- 12 cols on mobile, 6 on tablet, 4 on desktop -->
</div>

<!-- Dynamic columns with useResponsive -->
<div :class="`col-12 md:col-${12 / gridCols}`">
  <StatsCard />
</div>
```

---

## 🚀 Quick Start Examples

### Add Error Handling to a View:

```vue
<template>
  <ErrorBoundary>
    <div class="p-4">
      <Button @click="loadData">Load Data</Button>
      <!-- Your content -->
    </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { wrapAsync } = useErrorHandler()

const loadData = wrapAsync(async () => {
  // Your async logic
})
</script>
```

### Add Stats to Your View:

```vue
<template>
  <div class="grid">
    <div class="col-12 md:col-3">
      <StatsCard
        title="Your Metric"
        :value="yourValue"
        :loading="loading"
        icon="pi-chart-line"
        icon-color="blue"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import StatsCard from '@/components/StatsCard.vue'

const loading = ref(false)
const yourValue = ref(0)
</script>
```

### Make View Mobile-Friendly:

```vue
<template>
  <div>
    <!-- Hide on mobile -->
    <Card v-if="!isMobile()">
      Desktop-only features
    </Card>
    
    <!-- Responsive table -->
    <DataTable 
      :rows="rows" 
      :paginator="true"
      :responsive-layout="isMobile() ? 'stack' : 'scroll'"
    >
      <!-- columns -->
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useResponsive } from '@/composables/useResponsive'

const { isMobile, getTableRows } = useResponsive()
const rows = computed(() => getTableRows(50, 10))
</script>
```

---

## 📚 Additional Resources

- **Phase 4 Summary:** See `PHASE_4_SUMMARY.md` for full feature list
- **Component Examples:** Check `src/views/DashboardView.vue` for complete implementation
- **Test Examples:** See `src/modules/*/composables/*.spec.ts` for testing patterns
- **PrimeVue Docs:** https://primevue.org/
- **Vitest Docs:** https://vitest.dev/

---

**Need Help?** Check the copilot-instructions.md or ask GitHub Copilot!
