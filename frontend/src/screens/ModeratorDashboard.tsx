// =============================================================================
// ModeratorDashboard — STUB
// =============================================================================
// Port from prototype's ModeratorDashboard (and its sub-components ReportDetail
// and SuspendedUsersList).
// Mechanical changes:
//   • Pending/reviewed/enforced reports → mod.reports(status).
//   • Take action on a report           → mod.action({reportId, action, note}).
//   • Suspended users list              → mod.suspendedUsers().
//   • Reinstate user                    → mod.reinstate(userId, note).
// Audit log is rendered from the report row's audit_log array; no client
// computation needed.
// All visual layout, theming, and copy stay identical.
// =============================================================================

import type { Session } from "../hooks/useSession";

interface Props {
  session: Session;
  onLogout: () => void;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function ModeratorDashboard(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      ModeratorDashboard — port from prototype
    </div>
  );
}
