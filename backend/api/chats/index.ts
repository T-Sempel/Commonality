// =============================================================================
// /api/chats  — list and create
// =============================================================================
//   GET  → all chats this user participates in (RLS-enforced)
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseUserClient } from "../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const sb = supabaseUserClient(req);

  // RLS limits this to chats where auth.uid() is in participants.
  const { data: chats, error } = await sb
    .from("chats")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return fail(res, 500, "read_failed", error.message);

  // Pull message counts in a single follow-up query so the listing screen can
  // show "12 messages" without fetching full chat bodies.
  const ids = (chats || []).map((c) => c.id);
  let counts: Record<string, number> = {};
  if (ids.length) {
    const { data: msgs } = await sb
      .from("messages")
      .select("chat_id", { count: "exact", head: false })
      .in("chat_id", ids);
    for (const m of msgs || []) {
      counts[m.chat_id] = (counts[m.chat_id] || 0) + 1;
    }
  }

  return ok(
    res,
    (chats || []).map((c) => ({ ...c, messageCount: counts[c.id] || 0 }))
  );
}
