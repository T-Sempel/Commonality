// =============================================================================
// POST /api/auth/mod-login
// =============================================================================
// Gates moderator dashboard access.
//
// In production, you'd want SSO + a hardware-key requirement here.
// For the MVP, a static MOD_ACCESS_CODE env var + a separate "moderator" user
// in Supabase Auth is sufficient.
//
// Body: { code: string }
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../lib/http";

const Body = z.object({ code: z.string().min(1) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Missing code");

  const expected = process.env.MOD_ACCESS_CODE;
  if (!expected) {
    console.error("[mod-login] MOD_ACCESS_CODE not configured");
    return fail(res, 500, "not_configured", "Moderator login is unavailable");
  }
  if (parse.data.code !== expected) {
    return fail(res, 401, "invalid_code", "Invalid moderator code");
  }

  // Fetch (or create) the moderator user. Single shared moderator account
  // for the MVP; in production each moderator should have their own row + audit trail.
  const modEmail = "moderator@commonality.app";
  let modAuthUser;
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  modAuthUser = existing.users.find((u) => u.email === modEmail);
  if (!modAuthUser) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: modEmail,
      email_confirm: true,
    });
    if (error) return fail(res, 500, "create_failed", error.message);
    modAuthUser = created.user;
    await supabaseAdmin.from("users").upsert({
      id: modAuthUser.id,
      handle: "Moderator",
      role: "moderator",
    });
  }

  // Generate a magic-link session token for the mod.
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: modEmail,
  });
  if (linkErr || !link.properties?.hashed_token) {
    return fail(res, 500, "session_failed", "Could not mint session");
  }

  // Verify the OTP we just generated to materialize a session.
  const { data: verified } = await supabaseAdmin.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (!verified.session) return fail(res, 500, "session_failed", "No session");

  const isProd = process.env.VERCEL_ENV === "production";
  res.setHeader("Set-Cookie", [
    cookie("sb-access-token", verified.session.access_token, verified.session.expires_in, isProd),
    cookie("sb-refresh-token", verified.session.refresh_token, 60 * 60 * 24, isProd),
  ]);
  return ok(res, { role: "moderator" });
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  const flags = [`${name}=${encodeURIComponent(value)}`, `Path=/`, `Max-Age=${maxAgeSec}`, `HttpOnly`, `SameSite=Lax`];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}
