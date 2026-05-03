// =============================================================================
// SettingsScreen — STUB
// =============================================================================
// Port from prototype's SettingsScreen.
// Mechanical changes:
//   • Settings reads/writes go through useSettings hook (already wired).
//   • "Edit handle" / "Regenerate handle" → me.update({...}).
//   • "Delete account" → me.delete(), then onLogout().
//   • Blocked users list → blocks.list(), blocks.remove(userId).
// All visual layout, theming, and copy stay identical.
// =============================================================================

import type { UserSettings } from "@commonality/shared/types";
import type { Session } from "../hooks/useSession";

interface Props {
  session: Session;
  setScreen: (s: string) => void;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  setSession: (s: Session | null) => void;
  resolvedTheme: "light" | "dark";
  onLogout: () => void;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function SettingsScreen(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      SettingsScreen — port from prototype
    </div>
  );
}
