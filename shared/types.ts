// =============================================================================
// SHARED TYPES — used by both frontend and backend
// =============================================================================
// Keeping these in /shared ensures the API contract stays in sync.
// In a Vercel monorepo, both frontend and backend can import from "@commonality/shared".

export type UserId = string;
export type ChatId = string;
export type MatchId = string;
export type ReportId = string;

// ---------- USER ----------

export interface User {
  id: UserId;
  email: string;             // server-only — never returned by API to other users
  handle: string;            // anonymous display name shown to other users
  createdAt: number;
  banned: boolean;
  warnings: number;
  bannedAt?: number | null;
  bannedReason?: string | null;
  reinstatedAt?: number | null;
  tosAcceptedAt?: number;
  tosVersion?: string;
  role?: "user" | "moderator";
}

// What other users (and chat participants) are allowed to see.
// Strips email, role, ban metadata.
export interface PublicUserView {
  id: UserId;
  handle: string;
  createdAt: number;
}

// ---------- PROFILE ----------

export interface ProfileField {
  value: string;
  optInMatch: boolean;       // include this field when computing matches
  optInReveal: boolean;      // allow this field as a "difference reveal"
}

export type Profile = Record<string, ProfileField>;

// ---------- MATCH ----------

export interface SharedTrait {
  key: string;
  value: string;
  label: string;
}

export interface MatchProposal {
  user: PublicUserView;
  shared: SharedTrait[];
  futureCat: { key: string; label: string };
}

export interface Match {
  id: MatchId;
  a: UserId;
  b: UserId;
  shared: SharedTrait[];
  futureCat: { key: string; label: string };
  proposedAt: number;
  aAgreed: boolean;
  bAgreed: boolean;
  bothAgreed: boolean;
}

// ---------- CHAT ----------

export interface ChatMessage {
  id: string;
  from: UserId;
  text: string;
  at: number;
  warning?: string | null;
}

export interface Chat {
  id: ChatId;
  matchId: MatchId;
  participants: [UserId, UserId];
  handles: Record<UserId, string>;
  shared: SharedTrait[];
  revealKey: string | null;
  revealValues: Record<UserId, string> | null;
  revealLabel: string | null;
  messages: ChatMessage[];
  unlocked: boolean;
  unlockedAt?: number;
  readyConfirmed: Record<UserId, boolean>;
  createdAt: number;
  endedBy: UserId | "moderator" | null;
  endedAt?: number;
  savedBy: UserId[];
}

// ---------- REPORTS ----------

export type ReportStatus =
  | "pending"
  | "reviewed"
  | "dismissed"
  | "warn"
  | "suspended"
  | "blocked"
  | "reinstated";

export type ReportSeverity = "low" | "medium" | "high";

export interface AuditEntry {
  action: ReportStatus;
  by: UserId;
  byHandle?: string;
  at: number;
  note?: string | null;
  previousStatus?: ReportStatus;
}

export interface Report {
  id: ReportId;
  chatId: ChatId;
  reportedUser: UserId;
  reportedBy: UserId | "system";
  reason: string;
  severity: ReportSeverity;
  excerpt: string;
  at: number;
  status: ReportStatus;
  reviewedBy?: UserId;
  reviewedAt?: number;
  sharedTraits?: string[];
  auditLog?: AuditEntry[];
}

// ---------- SETTINGS ----------

export interface UserSettings {
  theme: "light" | "dark" | "system";
  notifications: {
    newMatches: boolean;
    newMessages: boolean;
    modActions: boolean;
  };
  privacy: {
    pauseMatching: boolean;
    requireBothReady: boolean;
    hideTraitTags: boolean;
  };
  safety: {
    piiSensitivity: "strict" | "standard" | "lenient";
  };
  conversations: {
    autoSaveOnLeave: boolean;
    confirmBeforeLeave: boolean;
  };
}

// ---------- API RESPONSE WRAPPERS ----------

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
