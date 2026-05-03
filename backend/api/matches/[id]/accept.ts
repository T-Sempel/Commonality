// =============================================================================
// POST /api/matches/[id]/accept
// =============================================================================
// Accepts a match proposal. The path parameter is the OTHER user's id (the
// match-list entry id is keyed off the candidate user). When both sides have
// accepted, a chat is created and returned.
//
// We use the admin client for the cross-user write since RLS blocks each
// user from inserting into the other's match row directly.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseAdmin, supabaseUserClient } from "../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../lib/http";
import { PROFILE_FIELDS } from "@commonality/shared/constants";
import type { ProfileField, SharedTrait } from "@commonality/shared/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");
  if (user.banned) return fail(res, 403, "banned", "Account suspended");

  const otherId = req.query.id as string;
  if (!otherId || otherId === user.id) return fail(res, 400, "bad_request", "Invalid match");

  const sb = supabaseUserClient(req);

  // Check this user isn't blocked from contacting other (or vice versa)
  const { data: blocks } = await supabaseAdmin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`
    );
  if (blocks && blocks.length > 0) return fail(res, 403, "blocked", "Cannot match with this user");

  // Compute shared traits and reveal candidate from BOTH profiles via admin.
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, data")
    .in("user_id", [user.id, otherId]);

  const myProfile: Record<string, ProfileField> = profiles?.find((p) => p.user_id === user.id)?.data || {};
  const theirProfile: Record<string, ProfileField> = profiles?.find((p) => p.user_id === otherId)?.data || {};

  const shared: SharedTrait[] = [];
  const revealCandidates: { key: string; label: string }[] = [];
  for (const k of Object.keys(theirProfile)) {
    const mine = myProfile[k];
    const theirs = theirProfile[k];
    const def = PROFILE_FIELDS.find((f) => f.key === k);
    const label = def?.label || k;
    if (mine?.optInMatch && theirs?.optInMatch && mine.value && mine.value === theirs.value) {
      shared.push({ key: k, value: mine.value, label });
    }
    if (mine?.optInReveal && theirs?.optInReveal && theirs.value && mine?.value !== theirs.value) {
      revealCandidates.push({ key: k, label });
    }
  }
  if (shared.length < 1 || revealCandidates.length < 1) {
    return fail(res, 422, "no_overlap", "No longer compatible — try another match");
  }
  const futureCat = revealCandidates[0];

  // Canonicalize match key by ordered ids so (A,B) and (B,A) collide.
  const [aId, bId] = [user.id, otherId].sort();
  const { data: existing } = await supabaseAdmin
    .from("matches")
    .select("*")
    .eq("user_a", aId)
    .eq("user_b", bId)
    .maybeSingle();

  let matchRow = existing;
  if (!matchRow) {
    const { data: created, error } = await supabaseAdmin
      .from("matches")
      .insert({ user_a: aId, user_b: bId, shared, future_cat: futureCat })
      .select()
      .single();
    if (error) return fail(res, 500, "create_failed", error.message);
    matchRow = created;
  }

  // Set the appropriate side's agreement flag
  const patch = user.id === aId ? { a_agreed: true } : { b_agreed: true };
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("matches")
    .update(patch)
    .eq("id", matchRow!.id)
    .select()
    .single();
  if (updErr) return fail(res, 500, "update_failed", updErr.message);

  if (!updated.both_agreed) {
    return ok(res, { waiting: true });
  }

  // Both agreed — create the chat
  const { data: revealValues } = { data: { [user.id]: myProfile[futureCat.key]?.value, [otherId]: theirProfile[futureCat.key]?.value } };
  const { data: chat, error: chatErr } = await supabaseAdmin
    .from("chats")
    .insert({
      match_id: updated.id,
      participants: [aId, bId],
      shared,
      reveal_key: futureCat.key,
      reveal_label: futureCat.label,
      reveal_values: revealValues,
    })
    .select()
    .single();
  if (chatErr) return fail(res, 500, "chat_create_failed", chatErr.message);

  return ok(res, { chatId: chat.id });
}
