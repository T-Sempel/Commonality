// =============================================================================
// GET /api/mod/users/suspended  — moderator-only
// =============================================================================
// Returns suspended/blocked user records with the moderator-view fields
// (handle, ban metadata, warnings) but never email or role.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireModerator, supabaseAdmin } from "../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../lib/http";
import { getModeratorView } from "../../../lib/privacy";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const auth = await requireModerator(req);
  if (!auth.ok) return fail(res, auth.status, "forbidden", auth.message);

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, handle, created_at, banned, banned_at, banned_reason, warnings")
    .eq("banned", true)
    .order("banned_at", { ascending: false });
  if (error) return fail(res, 500, "read_failed", error.message);

  return ok(res, (data || []).map(getModeratorView));
}
