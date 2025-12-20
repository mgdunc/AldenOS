
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz' // Service Role Key from earlier output

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const { data, error } = await supabase
    .from('integration_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Last Job:', data)
  }
}

main()
