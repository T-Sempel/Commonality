// =============================================================================
// POST /api/mod/users/[id]/reinstate — moderator-only
// =============================================================================
// Reverses a suspension/block, appends a "reinstated" audit entry to every
// related enforcement report, and notifies the user by email.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireModerator, supabaseAdmin } from "../../../../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../../../../lib/http";
import { sendEmail, reinstatementEmail } from "../../../../lib/email";

const Body = z.object({ note: z.string().min(1).max(500) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const auth = await requireModerator(req);
  if (!auth.ok) return fail(res, auth.status, "forbidden", auth.message);

  const targetId = req.query.id as string;
  const parse = Body.safeParse(req.body);
  if (!parse.success) return fail(res, 400, "bad_request", "Reason required");

  // Unban the user
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .update({ banned: false, reinstated_at: new Date().toISOString(), banned_reason: null })
    .eq("id", targetId)
    .select()
    .single();
  if (error || !user) return fail(res, 500, "update_failed", error?.message || "User not found");

  // Append reinstate audit entry to every prior enforcement report
  const { data: reports } = await supabaseAdmin
    .from("reports")
    .select("id, status, audit_log")
    .eq("reported_user", targetId)
    .in("status", ["suspended", "blocked"]);

  for (const r of reports || []) {
    const auditEntry = {
      action: "reinstated",
      by: auth.user.id,
      byHandle: auth.user.handle,
      at: Date.now(),
      note: parse.data.note,
      previousStatus: r.status,
    };
    await supabaseAdmin
      .from("reports")
      .update({
        status: "reinstated",
        audit_log: [...(r.audit_log || []), auditEntry],
      })
      .eq("id", r.id);
  }

  // Notify
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(targetId);
  if (authUser.user?.email) {
    await sendEmail({ to: authUser.user.email, ...reinstatementEmail(user.handle) });
  }

  return ok(res, { reinstated: true });
}
