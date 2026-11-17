import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const supabaseConfigurado = Boolean(url && key)
export const supabase = supabaseConfigurado ? createClient(url, key) : null
