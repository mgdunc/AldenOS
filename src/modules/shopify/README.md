# Shopify Module - Ultra Simplified

## Overview
Single-store Shopify integration with direct function invocation and real-time progress tracking.

**Key Features:**
- ✅ No multi-store complexity
- ✅ No queue system
- ✅ Direct edge function invocation
- ✅ Real-time progress via Postgres changes
- ✅ Environment variable configuration
- ✅ ~90% less code than previous version

## Configuration

### Environment Variables
Set these in your edge functions configuration:

```env
SHOPIFY_SHOP_URL=mystore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
SHOPIFY_API_VERSION=2024-01
```

No database configuration needed!

## Architecture

### Database Schema
Single table for sync tracking:

```sql
CREATE TABLE shopify_syncs (
  id UUID PRIMARY KEY,
  sync_type TEXT CHECK (sync_type IN ('products', 'orders')),
  status TEXT CHECK (status IN ('running', 'completed', 'failed')),
  
  -- Counters
  total_items INT,
  processed_items INT,
  created_count INT,
  updated_count INT,
  error_count INT,
  
  -- Progress
  current_page INT,
  progress_pct INT,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  error_message TEXT
);
```

Product/Order linkage via existing columns:
- `products.shopify_product_id`, `shopify_variant_id`, `shopify_inventory_item_id`
- `sales_orders.shopify_order_id`, `shopify_order_number`

### Frontend Structure

```
src/modules/shopify/
├── views/
│   └── shopify-dashboard.vue       Single dashboard view
├── composables/
│   └── useShopifySync.ts            Real-time sync composable
├── components/
│   └── SyncCard.vue                 Reusable sync card
├── routes.ts                        Single route
└── types.ts                         Minimal types
```

**Total Frontend Code:** ~400 lines

### Edge Functions

```
supabase/functions/
├── shopify-product-sync/          Products & variants
├── shopify-order-sync/            Orders & line items  
└── shopify-test-connection/      Test credentials
```

**Total Backend Code:** ~300 lines

## Usage

### Starting a Sync

The frontend directly invokes the edge function:

```typescript
await supabase.functions.invoke('shopify-product-sync')
// or
await supabase.functions.invoke('shopify-order-sync')
```

Progress updates automatically via realtime subscription to `shopify_syncs` table.

### Using the Composable

```vue
<script setup>
import { useShopifySync } from '@/modules/shopify/composables/useShopifySync'

// Create sync instance for products
const { syncing, progress, stats, startSync } = useShopifySync('products')
</script>

<template>
  <Button 
    :label="syncing ? 'Syncing...' : 'Start Sync'"
    :disabled="syncing"
    @click="startSync"
  />
  <ProgressBar v-if="syncing" :value="progress" />
</template>
```

### Composable API

```typescript
const {
  syncing,          // ref<boolean>
  currentSync,      // ref<ShopifySync | null>
  history,          // ref<ShopifySync[]>
  progress,         // computed<number> (0-100)
  statusSeverity,   // computed<string> (info/success/danger)
  stats,            // computed<Stats | null>
  startSync,        // () => Promise<void>
  formatSyncDate,   // (date: string) => string
  getDuration       // (sync: ShopifySync) => string
} = useShopifySync('products' | 'orders')
```

## How It Works

### Product Sync Flow

1. User clicks "Start Sync" in dashboard
2. Frontend calls `shopify-product-sync` edge function
3. Edge function:
   - Creates `shopify_syncs` record with status='running'
   - Paginates through Shopify products
   - For each product variant:
     - Checks if exists by SKU or shopify_variant_id
     - Creates or updates product record
   - Updates progress in real-time
   - Marks sync as completed/failed
4. Frontend receives real-time updates via Postgres changes subscription
5. UI updates progress bar and stats automatically

### Order Sync Flow

1. Same pattern as products
2. For each order:
   - Creates/updates sales_order
   - Syncs line items
   - Matches products by SKU or shopify_variant_id
3. Maps Shopify fulfillment status to WMS status
4. Real-time progress updates

## Benefits

### Compared to Previous Architecture

| Feature | Old | New |
|---------|-----|-----|
| **Lines of Code** | ~3000 | ~700 |
| **Tables** | 6 | 1 |
| **Edge Functions** | 7 | 3 |
| **Views** | 4 | 1 |
| **Composables** | 4 | 1 |
| **Configuration** | Database | Environment Variables |
| **Queue System** | Yes | No |
| **Multi-Store** | Yes | No |
| **Complexity** | High | Low |

### Performance Improvements

- ✅ **Faster sync start** - No queue overhead
- ✅ **Direct invocation** - No processor polling
- ✅ **Real-time updates** - Postgres changes, no polling
- ✅ **Simpler debugging** - Single execution path
- ✅ **Easier deployment** - Just environment variables

## Deployment

### 1. Apply Migration

```bash
supabase migration up
```

This will:
- Drop old tables (integrations, sync_queue, etc.)
- Create new `shopify_syncs` table
- Add/update product columns

### 2. Deploy Edge Functions

```bash
supabase functions deploy shopify-product-sync
supabase functions deploy shopify-order-sync
supabase functions deploy shopify-test-connection
```

### 3. Set Environment Variables

In Supabase Dashboard > Edge Functions > Settings:

```
SHOPIFY_SHOP_URL=mystore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
```

### 4. Access Dashboard

Navigate to `/shopify` in your application.

## Troubleshooting

### Connection Test Fails

1. Check environment variables are set correctly
2. Verify Shopify access token has required permissions:
   - `read_products`
   - `read_orders`
   - `read_inventory`
3. Check shop URL format (no https://, no trailing slash)

### Sync Fails Immediately

1. Check Edge Function logs: `supabase functions logs shopify-product-sync`
2. Verify database permissions (RLS policies)
3. Check for rate limiting from Shopify

### Real-time Updates Not Working

1. Verify `shopify_syncs` is added to realtime publication
2. Check browser console for subscription errors
3. Ensure RLS policies allow authenticated users to read syncs

## Future Enhancements

Possible additions (all optional):
- Webhook support for automatic syncs
- Incremental syncs (only changed items)
- Inventory level syncing
- Fulfillment status push-back to Shopify
- Customer syncing

All can be added without changing the core architecture!
