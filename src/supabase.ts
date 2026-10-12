import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

export const cloudConfigured = Boolean(url && key)
export const cloudSetupMessage = 'Cloud sync is ready to connect. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable accounts.'

// The browser may only ever receive the low-privilege publishable/anon key.
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export const appRedirectUrl = () => `${window.location.origin}/`
