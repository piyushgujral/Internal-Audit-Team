// AuditFlow public client configuration.
// Safe to expose the Supabase project URL and publishable/anon key in browser code.
// NEVER place a service_role key or database password in this file.
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
export const isSupabaseConfigured =
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");