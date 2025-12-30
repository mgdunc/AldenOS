# Critical Fixes Required

## 🔴 Immediate Security Fixes

### 1. Environment Variable Validation
**File:** `src/lib/supabase.ts`  
**Priority:** CRITICAL  
**Status:** ✅ FIXED

Add validation to prevent silent failures:

```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing required environment variables. ' +
    'Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  )
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY)
```

### 2. Disable DevTools in Production
**File:** `src/main.ts:37-38`  
**Priority:** HIGH  
**Status:** ✅ FIXED

Change:
```typescript
// @ts-ignore
app.config.devtools = true
```

To:
```typescript
app.config.devtools = import.meta.env.DEV
```

### 3. Secure Seed File
**File:** `supabase/seed.sql:27`  
**Priority:** CRITICAL  
**Status:** ✅ FIXED (Warnings added + Documentation)

**Completed:** 
- Added clear warning comments that this is DEV ONLY
- Created SECURITY.md with production deployment guidelines
- Documented that seed file should be disabled in production (`supabase/config.toml`)

**Note:** Seed files are typically only used in local development. For production, use proper user management and authentication.

---

## 🟡 High Priority Code Quality Fixes

### 4. Create Logging Utility
**Priority:** HIGH  
**Status:** ⬜ Not Started

Create `src/lib/logger.ts`:
- Logs to console in development
- Sends to error tracking service in production
- Respects log levels
- Replaces all `console.log` statements

### 5. Standardize Error Handling
**Priority:** HIGH  
**Status:** ⬜ Not Started

- Migrate all composables to use `useErrorHandler.wrapAsync()`
- Remove duplicate try/catch + toast patterns
- Start with: `useInventory.ts`, `useSalesOrders.ts`, `usePurchaseOrders.ts`

---

## Quick Wins (Can be done in 1-2 hours)

1. ✅ Fix environment variable validation (Frontend)
2. ✅ Fix environment variable validation (Edge Functions)
3. ✅ Disable DevTools in production  
4. ✅ Add `.env.example` file
5. ✅ Add comment to seed.sql about dev-only usage
6. ✅ Create SECURITY.md documentation

---

## Estimated Time

- Critical fixes: 30 minutes
- High priority fixes: 4-6 hours
- Full improvements: 2-3 weeks

