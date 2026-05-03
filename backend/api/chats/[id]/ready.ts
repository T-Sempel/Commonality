// =============================================================================
// POST /api/chats/[id]/ready  — opt in to early reveal
// =============================================================================
// The reveal unlocks when EITHER:
//   1. minMessages reached AND minPerSide on both sides, OR
//   2. maxWaitMs elapsed, OR
//   3. both participants have called this endpoint.
// This route handles case (3).
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseUserClient } from "../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const id = req.query.id as string;
  const sb = supabaseUserClient(req);

  const { data: chat, error: readErr } = await sb
    .from("chats")
    .select("ready_confirmed, participants, unlocked")
    .eq("id", id)
    .single();
  if (readErr || !chat) return fail(res, 404, "not_found", "Chat not found");
  if (chat.unlocked) return ok(res, { alreadyUnlocked: true });

  const ready: Record<string, boolean> = { ...(chat.ready_confirmed || {}), [user.id]: true };
  const [a, b] = chat.participants;
  const bothReady = ready[a] && ready[b];

  const update: Record<string, unknown> = { ready_confirmed: ready };
  if (bothReady) {
    update.unlocked = true;
    update.unlocked_at = new Date().toISOString();
  }

  const { error } = await sb.from("chats").update(update).eq("id", id);
  if (error) return fail(res, 500, "update_failed", error.message);

  return ok(res, { confirmed: true, unlocked: !!bothReady });
}
