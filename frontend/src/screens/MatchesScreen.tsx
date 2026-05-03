// =============================================================================
// MatchesScreen — STUB
// =============================================================================
// Port from prototype's MatchesScreen (see /commonality.jsx).
// Mechanical changes only:
//   • Replace seed-demo-users helper — real users come from /api/matches.
//   • `await safeList("users:")` etc. → `await matches.list()`
//   • Accepting a match → `await matches.accept(otherUserId)`,
//     which returns { chatId } or { waiting: true } if the other side hasn't
//     accepted yet. If chatId, call setActiveChatId(id) and setScreen("chat").
// All visual layout, theming, and copy stay identical.
// =============================================================================

import type { UserSettings } from "@commonality/shared/types";

interface Props {
  setScreen: (s: string) => void;
  setActiveChatId: (id: string) => void;
  settings: UserSettings;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function MatchesScreen(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      MatchesScreen — port from prototype
    </div>
  );
}
