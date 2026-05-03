// =============================================================================
// POST /api/auth/verify-otp
// =============================================================================
// Verifies a 6-digit code via Supabase Auth. On success:
//   - Supabase Auth issues an access_token + refresh_token
//   - We mirror the auth.users row into public.users (creating handle, defaults)
//     if this is a first-time signup
//   - We set httpOnly cookies so the browser sends the access_token on
//     subsequent /api/* requests
//
// Body: { email: string, token: string, mode: "signup" | "login", tosAccepted?: boolean }
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import { limits } from "../../lib/rateLimit";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../lib/http";
import { HANDLE_ADJ, HANDLE_NOUN, TOS_VERSION } from "@commonality/shared/constants";

const Body = z.object({
  email: z.string().email(),
  token: z.string().length(6),
  mode: z.enum(["signup", "login"]),
  tosAccepted: z.boolean().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Invalid input");
  const { email, token, mode, tosAccepted } = parse.data;

  if (mode === "signup" && !tosAccepted) {
    return fail(res, 400, "tos_required", "You must accept the terms to sign up");
  }

  // Rate limit verification attempts
  const rl = limits.otpVerify(email);
  if (!rl.ok) {
    return fail(res, 429, "rate_limited", "Too many attempts. Try again later.");
  }

  // Verify with Supabase Auth.
  // type "email" matches the OTP flow initiated by signInWithOtp.
  const { data, error } = await supabaseAdmin.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user || !data.session) {
    return fail(res, 401, "invalid_code", "Incorrect or expired code");
  }

  const authUserId = data.user.id;

  // First-time signup: create the public.users mirror row.
  if (mode === "signup") {
    const handle = generateHandle();
    const { error: insertErr } = await supabaseAdmin
      .from("users")
      .insert({
        id: authUserId,
        handle,
        tos_accepted_at: new Date().toISOString(),
        tos_version: TOS_VERSION,
      });
    if (insertErr && !insertErr.message.includes("duplicate")) {
      console.error("[verify-otp] insert error:", insertErr);
      return fail(res, 500, "internal", "Could not create account");
    }
    // Initialize default settings record
    await supabaseAdmin.from("settings").upsert({ user_id: authUserId, data: {} });
  }

  // Set httpOnly cookies for session.
  // SameSite=Lax keeps it usable for top-level navigation; HTTPS-only in prod.
  const isProd = process.env.VERCEL_ENV === "production";
  res.setHeader("Set-Cookie", [
    cookie("sb-access-token", data.session.access_token, data.session.expires_in, isProd),
    cookie("sb-refresh-token", data.session.refresh_token, 60 * 60 * 24 * 30, isProd),
  ]);

  return ok(res, {
    userId: authUserId,
    handle: (await fetchHandle(authUserId)) || "",
  });
}

function generateHandle() {
  const a = HANDLE_ADJ[Math.floor(Math.random() * HANDLE_ADJ.length)];
  const n = HANDLE_NOUN[Math.floor(Math.random() * HANDLE_NOUN.length)];
  return `${a} ${n}`;
}

async function fetchHandle(userId: string) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("handle")
    .eq("id", userId)
    .single();
  return data?.handle;
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  const flags = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}
