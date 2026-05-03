// =============================================================================
// DELETE /api/auth/logout
// =============================================================================
// Clears session cookies and revokes the Supabase session.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseUserClient } from "../../lib/supabase";
import { ok, handlePreflight, methodNotAllowed } from "../../lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "DELETE") return methodNotAllowed(res, ["DELETE"]);

  const sb = supabaseUserClient(req);
  await sb.auth.signOut().catch(() => {});

  res.setHeader("Set-Cookie", [
    "sb-access-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    "sb-refresh-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
  ]);
  return ok(res, { signedOut: true });
}
