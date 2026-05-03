// =============================================================================
// SHARED VALIDATION
// =============================================================================
// Same code on both sides. Frontend uses it for instant feedback,
// backend uses it as the authoritative gate before persisting messages.

import { BANNED_PHRASES, PII_PATTERNS } from "./constants";

export type Violation =
  | { type: "harassment"; phrase: string }
  | { type: "pii"; kind: "email" | "phone" | "url" | "handle" };

export function detectViolations(text: string): Violation[] {
  const issues: Violation[] = [];
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) issues.push({ type: "harassment", phrase });
  }
  for (const p of PII_PATTERNS) {
    if (p.pattern.test(text)) issues.push({ type: "pii", kind: p.name });
  }
  return issues;
}

export function maskPII(text: string): string {
  let out = text;
  for (const p of PII_PATTERNS) {
    out = out.replace(p.pattern, `[${p.name} hidden]`);
  }
  return out;
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function isValidHandle(handle: string): boolean {
  const trimmed = handle.trim();
  return trimmed.length >= 3 && trimmed.length <= 30 && !/[<>\\\/]/.test(trimmed);
}
