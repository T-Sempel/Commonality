// =============================================================================
// SavedChatsScreen — STUB
// =============================================================================
// Port from prototype's SavedChatsScreen.
// `await safeList("chats:")` filtering by user → `await chats.list()`.
// All visual layout, theming, and copy stay identical.
// =============================================================================

import type { Session } from "../hooks/useSession";

interface Props {
  setScreen: (s: string) => void;
  setActiveChatId: (id: string) => void;
  session: Session;
}

export default function SavedChatsScreen(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      SavedChatsScreen — port from prototype
    </div>
  );
}
