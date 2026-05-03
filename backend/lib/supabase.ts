// =============================================================================
// SUPABASE CLIENT FACTORY
// =============================================================================
// Two clients with very different privileges:
//
//   1. supabaseAdmin       — uses SERVICE_ROLE_KEY, bypasses Row Level Security.
//                            Use for: account creation, moderator dashboard reads,
//                            cascading deletes, anything that requires breaking RLS.
//
//   2. supabaseUserClient(req) — uses the user's JWT from cookies/headers.
//                                Subject to RLS at the database layer. This is the
//                                default; reach for it 99% of the time.
//
// CRITICAL: Never expose the admin client's data to a user response without first
// running getPublicView() to strip private fields (email, role, ban metadata).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars. Check .env.local or Vercel project settings."
  );
}

// -----------------------------------------------------------------------------
// ADMIN CLIENT — bypasses RLS. Server-only. Singleton.
// -----------------------------------------------------------------------------
export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// -----------------------------------------------------------------------------
// USER-CONTEXT CLIENT — RLS enforced. New instance per request.
// -----------------------------------------------------------------------------
export function supabaseUserClient(req: VercelRequest): SupabaseClient {
  const accessToken = extractAccessToken(req);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

function extractAccessToken(req: VercelRequest): string | null {
  // Prefer Authorization header
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  // Fall back to a cookie (set by the frontend after Supabase Auth exchange)
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/sb-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// -----------------------------------------------------------------------------
// AUTH HELPERS
// -----------------------------------------------------------------------------

/**
 * Resolve the authenticated user for an API request, or null.
 * Uses the user-context client so RLS is honored.
 */
export async function getAuthedUser(req: VercelRequest) {
  const sb = supabaseUserClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Resolve the user and their app-level user record.
 * Returns null if not signed in or if the app record doesn't exist yet.
 */
export async function getAuthedAppUser(req: VercelRequest) {
  const authUser = await getAuthedUser(req);
  if (!authUser) return null;
  const sb = supabaseUserClient(req);
  const { data, error } = await sb
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Require a moderator role, or short-circuit with a 403.
 */
export async function requireModerator(req: VercelRequest) {
  const appUser = await getAuthedAppUser(req);
  if (!appUser) return { ok: false as const, status: 401, message: "Unauthorized" };
  if (appUser.role !== "moderator") return { ok: false as const, status: 403, message: "Forbidden" };
  return { ok: true as const, user: appUser };
}
