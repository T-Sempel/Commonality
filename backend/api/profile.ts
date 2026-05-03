// =============================================================================
// /api/profile  — read or save own profile
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseUserClient } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";

const ProfileField = z.object({
  value: z.string(),
  optInMatch: z.boolean(),
  optInReveal: z.boolean(),
});
const ProfileBody = z.object({
  data: z.record(z.string(), ProfileField),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  const sb = supabaseUserClient(req);

  if (req.method === "GET") {
    const { data, error } = await sb
      .from("profiles")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return fail(res, 500, "read_failed", error.message);
    return ok(res, data?.data || {});
  }

  if (req.method === "PUT") {
    const parse = ProfileBody.safeParse(req.body);
    if (!parse.success) return fail(res, 400, "bad_request", "Invalid profile shape");

    const { error } = await sb
      .from("profiles")
      .upsert({ user_id: user.id, data: parse.data.data, updated_at: new Date().toISOString() });
    if (error) return fail(res, 500, "save_failed", error.message);
    return ok(res, { saved: true });
  }

  return methodNotAllowed(res, ["GET", "PUT"]);
}
