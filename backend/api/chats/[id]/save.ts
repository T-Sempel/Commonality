// =============================================================================
// POST /api/chats/[id]/save  — add this user to the saved_by list
// =============================================================================
// "Saving" is per-user. If the other party doesn't save, the chat still
// disappears from their history when it ends.
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
    .select("saved_by")
    .eq("id", id)
    .single();
  if (readErr || !chat) return fail(res, 404, "not_found", "Chat not found");

  const savedBy: string[] = chat.saved_by || [];
  if (savedBy.includes(user.id)) return ok(res, { alreadySaved: true });

  const { error } = await sb
    .from("chats")
    .update({ saved_by: [...savedBy, user.id] })
    .eq("id", id);
  if (error) return fail(res, 500, "update_failed", error.message);

  return ok(res, { saved: true });
}
