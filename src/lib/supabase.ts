import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

// This flag changes mail-related UI only; it never changes Supabase Auth settings or access checks.
export const emailDeliveryEnabled =
  import.meta.env.VITE_EMAIL_DELIVERY_ENABLED?.trim().toLowerCase() !== "false";

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
