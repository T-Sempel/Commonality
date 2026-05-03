// =============================================================================
// GET /api/chats/[id]  — full chat including messages
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseUserClient } from "../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const id = req.query.id as string;
  const sb = supabaseUserClient(req);

  // RLS gate: only participants can read.
  const { data: chat, error: chatErr } = await sb
    .from("chats")
    .select("*")
    .eq("id", id)
    .single();
  if (chatErr || !chat) return fail(res, 404, "not_found", "Chat not found");

  const { data: messages, error: msgErr } = await sb
    .from("messages")
    .select("*")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) return fail(res, 500, "read_failed", msgErr.message);

  return ok(res, {
    ...chat,
    messages: (messages || []).map((m) => ({
      id: m.id,
      from: m.from_user,
      text: m.text,
      at: new Date(m.created_at).getTime(),
      warning: m.warning,
    })),
  });
}
