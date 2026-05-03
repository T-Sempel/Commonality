// =============================================================================
// API CLIENT
// =============================================================================
// Typed wrapper over fetch() for /api/* routes. Cookies travel automatically;
// we don't manage tokens by hand.
//
// Replaces the prototype's window.storage.* calls with real network calls.
// =============================================================================

import type {
  ApiResult,
  Chat,
  ChatMessage,
  MatchProposal,
  Profile,
  Report,
  User,
  UserSettings,
} from "@commonality/shared/types";

const BASE = ""; // same-origin in production

async function call<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  let body: ApiResult<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("network", "Unexpected response", res.status);
  }
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }
  return body.data;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

// -----------------------------------------------------------------------------
// AUTH
// -----------------------------------------------------------------------------
export const auth = {
  sendOtp: (email: string, mode: "login" | "signup") =>
    call<{ sent: true }>("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email, mode }),
    }),

  verifyOtp: (email: string, token: string, mode: "login" | "signup", tosAccepted = false) =>
    call<{ userId: string; handle: string }>("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, token, mode, tosAccepted }),
    }),

  modLogin: (code: string) =>
    call<{ role: "moderator" }>("/api/auth/mod-login", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  logout: () => call<{ signedOut: true }>("/api/auth/logout", { method: "DELETE" }),
};

// -----------------------------------------------------------------------------
// ME
// -----------------------------------------------------------------------------
export const me = {
  get: () => call<User & { email?: string }>("/api/me"),
  update: (patch: { handle?: string; regenerateHandle?: boolean }) =>
    call<{ handle: string }>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }),
  delete: () => call<{ deleted: true }>("/api/me", { method: "DELETE" }),
};

// -----------------------------------------------------------------------------
// PROFILE
// -----------------------------------------------------------------------------
export const profile = {
  get: () => call<Profile>("/api/profile"),
  save: (data: Profile) =>
    call<{ saved: true }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),
};

// -----------------------------------------------------------------------------
// MATCHES
// -----------------------------------------------------------------------------
export const matches = {
  list: () => call<MatchProposal[]>("/api/matches"),
  accept: (otherUserId: string) =>
    call<{ chatId: string }>(`/api/matches/${otherUserId}/accept`, { method: "POST" }),
};

// -----------------------------------------------------------------------------
// CHATS
// -----------------------------------------------------------------------------
export const chats = {
  list: () => call<Chat[]>("/api/chats"),
  get: (id: string) => call<Chat>(`/api/chats/${id}`),
  send: (id: string, text: string) =>
    call<ChatMessage>(`/api/chats/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  ready: (id: string) => call<{ confirmed: true }>(`/api/chats/${id}/ready`, { method: "POST" }),
  leave: (id: string) => call<{ ended: true }>(`/api/chats/${id}/leave`, { method: "POST" }),
  save: (id: string) => call<{ saved: true }>(`/api/chats/${id}/save`, { method: "POST" }),
};

// -----------------------------------------------------------------------------
// SETTINGS
// -----------------------------------------------------------------------------
export const settings = {
  get: () => call<UserSettings>("/api/settings"),
  save: (s: UserSettings) =>
    call<{ saved: true }>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
};

// -----------------------------------------------------------------------------
// BLOCKS
// -----------------------------------------------------------------------------
export const blocks = {
  list: () => call<{ id: string; handle: string }[]>("/api/blocks"),
  add: (userId: string) => call<{ blocked: true }>("/api/blocks", { method: "POST", body: JSON.stringify({ userId }) }),
  remove: (userId: string) => call<{ unblocked: true }>(`/api/blocks/${userId}`, { method: "DELETE" }),
};

// -----------------------------------------------------------------------------
// REPORTS
// -----------------------------------------------------------------------------
export const reports = {
  file: (input: { chatId: string; reportedUser: string; reason: string; severity: "low" | "medium" | "high" }) =>
    call<{ filed: true }>("/api/reports", { method: "POST", body: JSON.stringify(input) }),
};

// -----------------------------------------------------------------------------
// MODERATOR
// -----------------------------------------------------------------------------
export const mod = {
  reports: (status: string = "pending") =>
    call<Report[]>(`/api/mod/reports?status=${status}`),
  action: (input: { reportId: string; action: string; note?: string }) =>
    call<{ action: string }>("/api/mod/reports", { method: "PATCH", body: JSON.stringify(input) }),
  suspendedUsers: () => call<unknown[]>("/api/mod/users/suspended"),
  reinstate: (userId: string, note: string) =>
    call<{ reinstated: true }>(`/api/mod/users/${userId}/reinstate`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
};
