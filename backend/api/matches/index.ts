// =============================================================================
// /api/matches — find candidates with shared traits
// =============================================================================
// Reads OTHER users' profiles via the admin client (RLS would block normal reads),
// but ONLY exposes their public view (id, handle, createdAt) plus the specific
// traits they opted in to share. Email, role, and ban status are never returned.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthedAppUser, supabaseAdmin, supabaseUserClient } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";
import { PROFILE_FIELDS } from "@commonality/shared/constants";
import { getPublicView } from "../lib/privacy";
import type { MatchProposal, ProfileField, SharedTrait } from "@commonality/shared/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");
  if (user.banned) return fail(res, 403, "banned", "Account suspended");

  const sb = supabaseUserClient(req);

  // Load my profile (RLS-allowed)
  const { data: myProfileRow } = await sb.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
  const myProfile: Record<string, ProfileField> = myProfileRow?.data || {};

  // Load my settings to check pauseMatching
  const { data: settingsRow } = await sb.from("settings").select("data").eq("user_id", user.id).maybeSingle();
  if (settingsRow?.data?.privacy?.pauseMatching) {
    return ok(res, []);
  }

  // Load my blocks
  const { data: blocks } = await sb.from("blocks").select("blocked_id").eq("blocker_id", user.id);
  const blockedIds = new Set((blocks || []).map((b) => b.blocked_id));

  // Load all OTHER non-banned, non-paused, non-moderator users via admin client.
  // We fetch only the columns we need.
  const { data: candidates } = await supabaseAdmin
    .from("users")
    .select("id, handle, created_at, banned, role")
    .neq("id", user.id)
    .eq("banned", false)
    .neq("role", "moderator");

  if (!candidates) return ok(res, []);

  // Pull their profiles in bulk
  const ids = candidates.map((c) => c.id);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, data")
    .in("user_id", ids);
  const profilesByUser = new Map<string, Record<string, ProfileField>>(
    (profiles || []).map((p) => [p.user_id, p.data || {}])
  );

  // Filter pauseMatching ones too
  const { data: theirSettings } = await supabaseAdmin
    .from("settings")
    .select("user_id, data")
    .in("user_id", ids);
  const pausedIds = new Set(
    (theirSettings || [])
      .filter((s) => s.data?.privacy?.pauseMatching)
      .map((s) => s.user_id)
  );

  const proposals: MatchProposal[] = [];
  for (const c of candidates) {
    if (blockedIds.has(c.id) || pausedIds.has(c.id)) continue;
    const theirProfile = profilesByUser.get(c.id) || {};

    const shared: SharedTrait[] = [];
    const theirRevealable: { key: string; label: string }[] = [];

    for (const key of Object.keys(theirProfile)) {
      const mine = myProfile[key];
      const theirs = theirProfile[key];
      const labelDef = PROFILE_FIELDS.find((f) => f.key === key);
      const label = labelDef?.label || key;

      if (mine?.optInMatch && theirs?.optInMatch && mine.value && theirs.value && mine.value === theirs.value) {
        shared.push({ key, value: mine.value, label });
      }
      if (theirs?.optInReveal && mine?.optInReveal && theirs.value !== mine?.value) {
        theirRevealable.push({ key, label });
      }
    }

    if (shared.length >= 1 && theirRevealable.length >= 1) {
      proposals.push({
        user: getPublicView(c),
        shared,
        futureCat: theirRevealable[0],
      });
    }
  }

  return ok(res, proposals);
}
