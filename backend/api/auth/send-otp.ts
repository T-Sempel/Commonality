// =============================================================================
// POST /api/auth/send-otp
// =============================================================================
// Sends a 6-digit OTP to the user's email via Supabase Auth.
//
// Supabase Auth handles:
//   - Generating the code
//   - Storing it server-side with TTL
//   - Sending the email (using built-in sender or your configured custom SMTP)
//   - Tracking attempts
//
// We add app-level rate limiting on top.
//
// Body: { email: string, mode: "signup" | "login" }
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import { limits } from "../../lib/rateLimit";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../lib/http";
import { isValidEmail } from "@commonality/shared/validation";

const Body = z.object({
  email: z.string().email().max(254),
  mode: z.enum(["signup", "login"]),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Invalid email or mode");
  const { email, mode } = parse.data;

  if (!isValidEmail(email)) return fail(res, 400, "bad_email", "Invalid email format");

  // Rate limit: 3 OTP sends per email per hour
  const rl = limits.otpSend(email);
  if (!rl.ok) {
    return fail(
      res,
      429,
      "rate_limited",
      `Too many requests. Try again at ${new Date(rl.resetAt).toISOString()}`
    );
  }

  // Check existence to enforce signup-vs-login semantics.
  // Use admin client to query auth.users (the public.users mirror is also fine).
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("users")
    .select("id, banned")
    .eq("id", await getAuthUserIdByEmail(email))
    .maybeSingle();

  if (lookupErr) {
    console.error("[send-otp] lookup error:", lookupErr);
    return fail(res, 500, "internal", "Lookup failed");
  }

  if (mode === "login" && !existing) {
    // Soft-fail to avoid email enumeration:
    // we still claim "code sent" but don't actually send. The frontend can
    // optionally surface "no account found" only after several failed attempts.
    // For the prototype we just say so directly; harden in production.
    return fail(res, 404, "no_account", "No account found for that email");
  }
  if (mode === "signup" && existing) {
    return fail(res, 409, "account_exists", "Account exists — log in instead");
  }
  if (existing?.banned) {
    return fail(res, 403, "banned", "This account has been suspended");
  }

  // Trigger the actual send via Supabase Auth.
  // shouldCreateUser controls whether a brand-new auth.users row gets created.
  const { error } = await supabaseAdmin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: mode === "signup",
      // Embed mode in metadata so the verify endpoint can correlate.
      data: { mode },
    },
  });

  if (error) {
    console.error("[send-otp] supabase error:", error);
    return fail(res, 500, "send_failed", "Could not send code");
  }

  return ok(res, { sent: true });
}

// Helper: resolve auth.users.id from email via admin API.
// Returns null if no such user. (We keep this here rather than in lib because
// it's specific to auth-flow gating.)
async function getAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return null;
  const u = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return u?.id ?? null;
}
