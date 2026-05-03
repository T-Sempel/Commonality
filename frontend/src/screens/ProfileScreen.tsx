// =============================================================================
// ProfileScreen — STUB
// =============================================================================
// Port from prototype's ProfileScreen (see /commonality.jsx).
// Mechanical changes only:
//   • `await safeGet("profiles:" + session.userId)` → `await profile.get()`
//   • `await safeSet("profiles:..." , data)`        → `await profile.save(data)`
// All visual layout, theming, and copy stay identical to the prototype.
// =============================================================================

interface Props {
  setScreen: (s: string) => void;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function ProfileScreen(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      ProfileScreen — port from prototype
    </div>
  );
}
