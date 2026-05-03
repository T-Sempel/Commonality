// =============================================================================
// SUPABASE BROWSER CLIENT
// =============================================================================
// ONLY exposes the anon key. Never put SERVICE_ROLE_KEY here — it would let
// any visitor bypass RLS.
//
// We use this client for:
//   - Realtime subscriptions to public.messages (live chat updates)
//   - Auth state (mirrors what the cookie says — useful for instant UI)
//
// All mutations go through /api/*, NOT direct Supabase calls. See lib/api.ts.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Realtime + auth state will not work. Copy .env.example to .env.local."
  );
}

export const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
