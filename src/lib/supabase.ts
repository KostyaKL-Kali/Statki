import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error('Brak zmiennych VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY w .env')
}

export const supabase = createClient(url, key)
