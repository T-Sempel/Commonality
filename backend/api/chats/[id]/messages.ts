// =============================================================================
// POST /api/chats/[id]/messages
// =============================================================================
// Send a message to a chat. Server-side PII detection is authoritative —
// the frontend's check is just for instant feedback.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseUserClient, supabaseAdmin } from "../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../lib/http";
import { detectViolations, maskPII } from "@commonality/shared/validation";
import { limits } from "../../../lib/rateLimit";
import { NEW_ACCOUNT_AGE_MS, REVEAL_RULES } from "@commonality/shared/constants";

const Body = z.object({ text: z.string().min(1).max(2000) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");
  if (user.banned) return fail(res, 403, "banned", "Account suspended");

  const chatId = req.query.id as string;
  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Empty or invalid message");

  const sb = supabaseUserClient(req);

  // RLS ensures only participants can read this chat
  const { data: chat, error } = await sb.from("chats").select("*").eq("id", chatId).single();
  if (error || !chat) return fail(res, 404, "not_found", "Chat not found");
  if (chat.ended_by) return fail(res, 410, "chat_ended", "Conversation has ended");

  // Rate limit for new accounts
  const accountAge = Date.now() - new Date(user.created_at).getTime();
  if (accountAge < NEW_ACCOUNT_AGE_MS) {
    const rl = limits.messageSend(user.id);
    if (!rl.ok) return fail(res, 429, "rate_limited", "Slow down — new accounts have a message cap.");
  }

  // Load this user's safety setting
  const { data: settings } = await sb.from("settings").select("data").eq("user_id", user.id).maybeSingle();
  const piiSensitivity = settings?.data?.safety?.piiSensitivity || "standard";

  const violations = detectViolations(parse.data.text);
  const harassment = violations.find((v) => v.type === "harassment");
  if (harassment) {
    // Auto-create a system report and increment warnings.
    await supabaseAdmin.from("reports").insert({
      chat_id: chatId,
      reported_user: user.id,
      reported_by: "system",
      reason: "auto_harassment",
      severity: "high",
      excerpt: parse.data.text.slice(0, 200),
      shared_traits: chat.shared,
    });
    await supabaseAdmin.from("users").update({ warnings: (user.warnings || 0) + 1 }).eq("id", user.id);
    return fail(res, 422, "harassment", "Message blocked: harassment detected. Reported to moderators.");
  }

  let displayText = parse.data.text;
  let warning: string | null = null;

  const piiViolation = violations.find((v) => v.type === "pii");
  if (piiViolation) {
    if (piiSensitivity === "strict") {
      return fail(res, 422, "pii_blocked", "Message contains personal info. Edit and try again.");
    } else if (piiSensitivity === "lenient") {
      warning = "Heads up: this looks like personal info";
    } else {
      displayText = maskPII(parse.data.text);
      warning = "PII auto-hidden";
    }
  }

  // Insert the message — RLS will verify participant status
  const { data: inserted, error: msgErr } = await sb.from("messages").insert({
    chat_id: chatId,
    from_user: user.id,
    text: displayText,
    warning,
  }).select().single();
  if (msgErr) return fail(res, 500, "insert_failed", msgErr.message);

  // Check unlock conditions and update chat if it should reveal
  await maybeReveal(chat.id);

  return ok(res, inserted);
}

async function maybeReveal(chatId: string) {
  const { data: chat } = await supabaseAdmin.from("chats").select("*").eq("id", chatId).single();
  if (!chat || chat.unlocked) return;

  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("from_user, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  const total = msgs?.length || 0;
  const [a, b] = chat.participants;
  const aCount = msgs?.filter((m) => m.from_user === a).length || 0;
  const bCount = msgs?.filter((m) => m.from_user === b).length || 0;
  const elapsed = Date.now() - new Date(chat.created_at).getTime();
  const readyConfirmed = chat.ready_confirmed || {};
  const bothReady = readyConfirmed[a] && readyConfirmed[b];

  const shouldReveal =
    bothReady ||
    (total >= REVEAL_RULES.minMessages &&
      aCount >= REVEAL_RULES.minPerSide &&
      bCount >= REVEAL_RULES.minPerSide) ||
    elapsed > REVEAL_RULES.maxWaitMs;

  if (shouldReveal) {
    await supabaseAdmin
      .from("chats")
      .update({ unlocked: true, unlocked_at: new Date().toISOString() })
      .eq("id", chatId);
  }
}
