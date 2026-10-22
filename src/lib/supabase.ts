import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

// Only a Supabase publishable/anon key belongs in the browser. Never use service_role.
export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && key.length > 20;
export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
