/**
 * Environment variable validation utility for Supabase Edge Functions
 * Ensures required environment variables are present before function execution
 */

export interface SupabaseEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

/**
 * Validates and returns required Supabase environment variables
 * Throws an error if any required variables are missing
 */
export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || supabaseUrl.trim() === '') {
    throw new Error(
      'Missing required environment variable: SUPABASE_URL. ' +
      'Please ensure this is set in your Supabase project settings.'
    )
  }

  if (!supabaseServiceKey || supabaseServiceKey.trim() === '') {
    throw new Error(
      'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY. ' +
      'Please ensure this is set in your Supabase project settings. ' +
      'This is a sensitive key and should never be exposed in client-side code.'
    )
  }

  // Basic validation - ensure URL looks valid
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    throw new Error(
      `Invalid SUPABASE_URL format: ${supabaseUrl}. ` +
      'URL must start with http:// or https://'
    )
  }

  // Basic validation - ensure service key looks valid (Supabase keys are typically JWT tokens)
  if (supabaseServiceKey.length < 100) {
    throw new Error(
      'Invalid SUPABASE_SERVICE_ROLE_KEY format. ' +
      'Service role keys should be JWT tokens (typically 200+ characters).'
    )
  }

  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey
  }
}

