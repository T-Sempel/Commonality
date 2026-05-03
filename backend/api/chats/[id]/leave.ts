// =============================================================================
// POST /api/chats/[id]/leave  — end the conversation
// =============================================================================
// Either participant can end. We record who, so the other side can see a
// neutral "they ended the conversation" status.
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
    .select("ended_by, participants")
    .eq("id", id)
    .single();
  if (readErr || !chat) return fail(res, 404, "not_found", "Chat not found");
  if (chat.ended_by) return ok(res, { alreadyEnded: true });

  const { error } = await sb
    .from("chats")
    .update({ ended_by: user.id, ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(res, 500, "update_failed", error.message);

  return ok(res, { ended: true });
}
