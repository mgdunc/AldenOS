# Edge Function Troubleshooting Guide

## Current Issue: FunctionsFetchError

The diagnostics show:
- ✅ Environment variables are set correctly
- ✅ Supabase connection works
- ❌ Edge Functions return `FunctionsFetchError: Failed to send a request to the Edge Function`

## Possible Causes & Solutions

### 1. Check Supabase Dashboard Settings

**Edge Functions CORS Configuration:**
1. Go to https://supabase.com/dashboard/project/xnqirsujttbcamccbhmf/settings/api
2. Check "CORS" settings
3. Ensure your Vercel domain is allowed:
   - `https://aldenos.vercel.app`
   - `https://*.vercel.app` (wildcard for preview deployments)

**Edge Functions Access:**
1. Go to https://supabase.com/dashboard/project/xnqirsujttbcamccbhmf/functions
2. Verify `shopify-order-sync` is listed and shows "Active"
3. Check function logs for any errors

### 2. Test Edge Function Directly

Test the function with curl to verify it's accessible:

```bash
curl -X POST \
  'https://xnqirsujttbcamccbhmf.supabase.co/functions/v1/shopify-order-sync' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"test": true}'
```

Replace `YOUR_ANON_KEY` with your actual anon key.

### 3. Verify Vercel Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

**Required Variables:**
- `VITE_SUPABASE_URL` = `https://xnqirsujttbcamccbhmf.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = Your anon key (starts with `sb_publishable_...`)

**Important:**
- Ensure variables are set for **Production** environment
- Redeploy after adding/updating variables

### 4. Check Browser Console

Open browser DevTools → Network tab:
1. Try invoking an Edge Function
2. Look for the request to `functions/v1/shopify-order-sync`
3. Check:
   - Request URL (should be correct)
   - Request headers (should include `Authorization` and `apikey`)
   - Response status (if any)
   - CORS errors (red in console)

### 5. Verify Edge Function Deployment

```bash
# List deployed functions
supabase functions list

# Redeploy if needed
supabase functions deploy shopify-order-sync
```

### 6. Network/Firewall Issues

If the function works locally but not in production:
- Check if Vercel has any firewall rules
- Verify Supabase project allows requests from Vercel IPs
- Check Supabase project status: https://status.supabase.com

### 7. Alternative: Use Service Role Key (Not Recommended)

**⚠️ WARNING:** Service role key should NEVER be exposed in client-side code. This is only for testing.

If you need to test with service role (server-side only):
- Create a server-side API route in Vercel
- Use service role key only in server-side code
- Client calls your API route, which calls the Edge Function

## Current Configuration

- **Supabase URL:** `https://xnqirsujttbcamccbhmf.supabase.co`
- **Project ID:** `xnqirsujttbcamccbhmf`
- **Vercel Domain:** `https://aldenos.vercel.app`
- **Edge Function:** `shopify-order-sync`

## Next Steps

1. ✅ Check Supabase Dashboard CORS settings
2. ✅ Test Edge Function with curl
3. ✅ Verify Vercel environment variables
4. ✅ Check browser console for detailed errors
5. ✅ Redeploy Edge Functions if needed

## Diagnostic Tools

Use the diagnostics page at `/dev/diagnostics` to:
- Verify environment variables
- Test Supabase connection
- Test Edge Function connectivity
- View system information

