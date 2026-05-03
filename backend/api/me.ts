// =============================================================================
// /api/me — current user record (own data only)
// =============================================================================
//   GET    → returns the authed user's record (includes email, since it's their own)
//   PATCH  → update handle and/or trigger handle regeneration
//   DELETE → delete account, cascading to all owned tables
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getAuthedAppUser, supabaseAdmin, supabaseUserClient } from "../lib/supabase";
import { ok, fail, handlePreflight, methodNotAllowed } from "../lib/http";
import { isValidHandle } from "@commonality/shared/validation";
import { HANDLE_ADJ, HANDLE_NOUN } from "@commonality/shared/constants";
import { sendEmail, accountDeletedEmail } from "../lib/email";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  const user = await getAuthedAppUser(req);
  if (!user) return fail(res, 401, "unauthorized", "Sign in required");

  if (req.method === "GET") {
    // Self-view: includes email, since the user is reading their own record
    const sb = supabaseUserClient(req);
    const { data: authUser } = await sb.auth.getUser();
    return ok(res, {
      ...user,
      email: authUser.user?.email,
    });
  }

  if (req.method === "PATCH") {
    const Body = z.object({
      handle: z.string().optional(),
      regenerateHandle: z.boolean().optional(),
    });
    const parse = Body.safeParse(req.body);
    if (!parse.success) return fail(res, 400, "bad_request", "Invalid input");

    let nextHandle = user.handle;
    if (parse.data.regenerateHandle) {
      nextHandle = `${HANDLE_ADJ[Math.floor(Math.random()*HANDLE_ADJ.length)]} ${HANDLE_NOUN[Math.floor(Math.random()*HANDLE_NOUN.length)]}`;
    } else if (parse.data.handle) {
      if (!isValidHandle(parse.data.handle)) {
        return fail(res, 400, "bad_handle", "Handle must be 3-30 characters");
      }
      nextHandle = parse.data.handle.trim();
    }

    const sb = supabaseUserClient(req);
    const { error } = await sb.from("users").update({ handle: nextHandle }).eq("id", user.id);
    if (error) return fail(res, 500, "update_failed", error.message);
    return ok(res, { handle: nextHandle });
  }

  if (req.method === "DELETE") {
    // Cascade delete via Supabase Auth admin API. Foreign keys with ON DELETE CASCADE
    // will wipe public.users → profiles, settings, blocks, messages, matches, chats, reports.
    const { data: authUser } = await supabaseUserClient(req).auth.getUser();
    const email = authUser.user?.email;
    const handle = user.handle;

    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) return fail(res, 500, "delete_failed", error.message);

    if (email) {
      await sendEmail({ to: email, ...accountDeletedEmail(handle) });
    }

    res.setHeader("Set-Cookie", [
      "sb-access-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      "sb-refresh-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
    return ok(res, { deleted: true });
  }

  return methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
}
