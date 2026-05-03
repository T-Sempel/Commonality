// =============================================================================
// /api/blocks  — list / add
// =============================================================================
// Blocks are per-user. Adding a block ends any active chat with the target
// and prevents future matches in either direction.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseAdmin, supabaseUserClient } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";
import { getPublicView } from "../lib/privacy";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const sb = supabaseUserClient(req);

  if (req.method === "GET") {
    const { data: rows } = await sb.from("blocks").select("blocked_id, created_at").eq("blocker_id", user.id);
    if (!rows || rows.length === 0) return ok(res, []);

    // Hydrate handles via admin (RLS won't expose other users' rows directly).
    const ids = rows.map((r) => r.blocked_id);
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, handle, created_at")
      .in("id", ids);

    const byId = new Map((users || []).map((u) => [u.id, u]));
    return ok(
      res,
      rows.map((r) => {
        const u = byId.get(r.blocked_id);
        return {
          ...(u ? getPublicView(u) : { id: r.blocked_id, handle: "Unknown", createdAt: 0 }),
          blockedAt: new Date(r.created_at).getTime(),
        };
      })
    );
  }

  if (req.method === "POST") {
    const Body = z.object({ userId: z.string().uuid() });
    const parse = Body.safeParse(req.body);
    if (!parse.success) return fail(res, 400, "bad_request", "Invalid userId");
    if (parse.data.userId === user.id) return fail(res, 400, "self_block", "Cannot block yourself");

    const { error } = await sb.from("blocks").upsert({ blocker_id: user.id, blocked_id: parse.data.userId });
    if (error) return fail(res, 500, "insert_failed", error.message);

    // End any active chats between these two users
    const { data: chats } = await supabaseAdmin
      .from("chats")
      .select("id, participants, ended_by")
      .contains("participants", [user.id]);
    for (const c of chats || []) {
      if (c.ended_by) continue;
      if (c.participants.includes(parse.data.userId)) {
        await supabaseAdmin
          .from("chats")
          .update({ ended_by: user.id, ended_at: new Date().toISOString() })
          .eq("id", c.id);
      }
    }

    return ok(res, { blocked: true });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
}
