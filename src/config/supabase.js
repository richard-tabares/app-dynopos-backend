import { createClient } from '@supabase/supabase-js'
const supabaseUrl = procces.enve.SUPABASE_URL
const supabaseAnonKey = procces.enve.SUPABASE_ANON_KEY

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, supabaseAnonKey)