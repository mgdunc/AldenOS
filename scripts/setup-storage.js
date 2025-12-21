import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupStorage() {
  console.log('Setting up storage bucket...')
  
  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  
  if (listError) {
    console.error('Error listing buckets:', listError)
    process.exit(1)
  }
  
  const existingBucket = buckets.find(b => b.id === 'products')
  
  if (existingBucket) {
    console.log('Bucket "products" already exists')
    
    // Update bucket settings
    const { data: updateData, error: updateError } = await supabase.storage.updateBucket('products', {
      public: true,
      fileSizeLimit: 5242880,
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    })
    
    if (updateError) {
      console.error('Error updating bucket:', updateError)
    } else {
      console.log('✓ Updated bucket settings')
    }
  } else {
    // Create bucket
    const { data: createData, error: createError } = await supabase.storage.createBucket('products', {
      public: true,
      fileSizeLimit: 5242880,
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    })
    
    if (createError) {
      console.error('Error creating bucket:', createError)
      process.exit(1)
    }
    
    console.log('✓ Created bucket "products"')
  }
  
  console.log('\nStorage bucket setup complete!')
}

setupStorage().catch(console.error)
