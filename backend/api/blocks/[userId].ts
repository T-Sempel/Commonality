// =============================================================================
// DELETE /api/blocks/[userId]  — unblock
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseUserClient } from "../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "DELETE") return methodNotAllowed(res, ["DELETE"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const blockedId = req.query.userId as string;
  const sb = supabaseUserClient(req);

  const { error } = await sb
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);
  if (error) return fail(res, 500, "delete_failed", error.message);

  return ok(res, { unblocked: true });
}
