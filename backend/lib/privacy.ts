// =============================================================================
// PRIVACY HELPERS
// =============================================================================
// Centralized field-stripping. Call before returning ANY user record that
// crosses a privilege boundary (admin → user, user → other-user).
// =============================================================================

import type { PublicUserView, User } from "@commonality/shared/types";

/**
 * Strip everything except the fields safe to share with another user.
 * NEVER returns email, role, banned status, warnings, audit metadata.
 */
export function getPublicView(user: User | Record<string, unknown>): PublicUserView {
  return {
    id: user.id as string,
    handle: user.handle as string,
    createdAt: (user.created_at || user.createdAt) as number,
  };
}

/**
 * For moderator dashboard: include enforcement-relevant fields (handle, ban
 * status, warning count, ban date/reason) but strip email and role still.
 */
export function getModeratorView(user: User | Record<string, unknown>) {
  return {
    id: user.id as string,
    handle: user.handle as string,
    createdAt: (user.created_at || user.createdAt) as number,
    banned: (user.banned as boolean) ?? false,
    bannedAt: (user.banned_at || user.bannedAt) as number | undefined,
    bannedReason: (user.banned_reason || user.bannedReason) as string | undefined,
    warnings: (user.warnings as number) ?? 0,
  };
}
