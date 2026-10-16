import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without these the app runs in local-only mode (data stays on this device).
export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null
