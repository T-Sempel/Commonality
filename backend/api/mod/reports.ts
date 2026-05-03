// =============================================================================
// /api/mod/reports — moderator-only
// =============================================================================
//   GET             → list reports (filterable by status)
//   PATCH /:id      → take action: dismiss / review / warn / suspend / block
//
// All routes here require role = "moderator". Other users receive 403.
// Even within mod actions, we strip emails from any user record returned.
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireModerator, supabaseAdmin } from "../../lib/supabase";
import { ok, fail, handlePreflight } from "../../lib/http";
import { sendEmail, suspensionNoticeEmail } from "../../lib/email";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;

  const auth = await requireModerator(req);
  if (!auth.ok) return fail(res, auth.status, "forbidden", auth.message);

  if (req.method === "GET") {
    const status = (req.query.status as string) || "pending";
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("*")
      .eq("status", status)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return fail(res, 500, "read_failed", error.message);
    return ok(res, data || []);
  }

  if (req.method === "PATCH") {
    const Body = z.object({
      reportId: z.string().uuid(),
      action: z.enum(["dismissed", "reviewed", "warn", "suspended", "blocked"]),
      note: z.string().max(500).optional(),
    });
    const parse = Body.safeParse(req.body);
    if (!parse.success) return fail(res, 400, "bad_request", "Invalid input");
    const { reportId, action, note } = parse.data;

    const { data: report, error: readErr } = await supabaseAdmin
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .single();
    if (readErr || !report) return fail(res, 404, "not_found", "Report not found");

    // Append audit entry
    const auditEntry = {
      action,
      by: auth.user.id,
      byHandle: auth.user.handle,
      at: Date.now(),
      note: note || null,
    };
    const { error: updateErr } = await supabaseAdmin
      .from("reports")
      .update({
        status: action,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        audit_log: [...(report.audit_log || []), auditEntry],
      })
      .eq("id", reportId);
    if (updateErr) return fail(res, 500, "update_failed", updateErr.message);

    // Apply consequences
    if (action === "warn") {
      await supabaseAdmin
        .from("users")
        .update({ warnings: (await getWarnings(report.reported_user)) + 1 })
        .eq("id", report.reported_user);
    }

    if (action === "suspended" || action === "blocked") {
      await supabaseAdmin
        .from("users")
        .update({
          banned: true,
          banned_at: new Date().toISOString(),
          banned_reason: report.reason,
        })
        .eq("id", report.reported_user);

      // End the related chat
      if (report.chat_id) {
        await supabaseAdmin
          .from("chats")
          .update({ ended_by: "moderator", ended_at: new Date().toISOString() })
          .eq("id", report.chat_id);
      }

      // Notify the user (we need their email — admin client + auth API)
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(report.reported_user);
      if (authUser.user?.email) {
        const { data: u } = await supabaseAdmin.from("users").select("handle").eq("id", report.reported_user).single();
        await sendEmail({ to: authUser.user.email, ...suspensionNoticeEmail(u?.handle || "there", report.reason) });
      }
    }

    return ok(res, { action });
  }

  return fail(res, 405, "method_not_allowed", "GET or PATCH");
}

async function getWarnings(userId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("users").select("warnings").eq("id", userId).single();
  return data?.warnings || 0;
}
