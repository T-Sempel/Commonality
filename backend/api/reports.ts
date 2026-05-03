// =============================================================================
// POST /api/reports — file a report
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseUserClient, supabaseAdmin } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";
import { limits } from "../lib/rateLimit";

const Body = z.object({
  chatId: z.string().uuid(),
  reportedUser: z.string().uuid(),
  reason: z.string().min(1).max(120),
  severity: z.enum(["low", "medium", "high"]),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Invalid report");

  const rl = limits.reportCreate(user.id);
  if (!rl.ok) return fail(res, 429, "rate_limited", "Too many reports filed today");

  const sb = supabaseUserClient(req);

  // Verify the reporter actually participated in this chat (RLS-protected read)
  const { data: chat } = await sb.from("chats").select("participants, shared").eq("id", parse.data.chatId).single();
  if (!chat) return fail(res, 404, "chat_not_found", "Chat not found");

  // Build excerpt from the REPORTED user's last 3 messages only.
  // Don't include the reporter's content in the excerpt — privacy.
  const { data: msgs } = await sb
    .from("messages")
    .select("text, from_user")
    .eq("chat_id", parse.data.chatId)
    .order("created_at", { ascending: false })
    .limit(20);

  const excerpt = (msgs || [])
    .filter((m) => m.from_user === parse.data.reportedUser)
    .slice(0, 3)
    .map((m) => m.text)
    .join(" / ")
    .slice(0, 300);

  const { error } = await supabaseAdmin.from("reports").insert({
    chat_id: parse.data.chatId,
    reported_user: parse.data.reportedUser,
    reported_by: user.id,
    reason: parse.data.reason,
    severity: parse.data.severity,
    excerpt: excerpt || "(no recent messages from reported user)",
    shared_traits: chat.shared,
  });

  if (error) return fail(res, 500, "insert_failed", error.message);
  return ok(res, { filed: true });
}
