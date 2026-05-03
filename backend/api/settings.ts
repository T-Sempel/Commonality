// =============================================================================
// /api/settings  — get and save user settings (theme, privacy, safety, etc.)
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseUserClient } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";

const SettingsBody = z.object({
  theme: z.enum(["light", "dark", "system"]),
  notifications: z.object({
    newMatches: z.boolean(),
    newMessages: z.boolean(),
    modActions: z.boolean(),
  }),
  privacy: z.object({
    pauseMatching: z.boolean(),
    requireBothReady: z.boolean(),
    hideTraitTags: z.boolean(),
  }),
  safety: z.object({
    piiSensitivity: z.enum(["strict", "standard", "lenient"]),
  }),
  conversations: z.object({
    autoSaveOnLeave: z.boolean(),
    confirmBeforeLeave: z.boolean(),
  }),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const sb = supabaseUserClient(req);

  if (req.method === "GET") {
    const { data } = await sb.from("settings").select("data").eq("user_id", user.id).maybeSingle();
    return ok(res, data?.data || {});
  }

  if (req.method === "PUT") {
    const parse = SettingsBody.safeParse(req.body);
    if (!parse.success) return fail(res, 400, "bad_request", "Invalid settings shape");

    const { error } = await sb
      .from("settings")
      .upsert({ user_id: user.id, data: parse.data, updated_at: new Date().toISOString() });
    if (error) return fail(res, 500, "save_failed", error.message);
    return ok(res, { saved: true });
  }

  return methodNotAllowed(res, ["GET", "PUT"]);
}
