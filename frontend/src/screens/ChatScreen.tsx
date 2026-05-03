// =============================================================================
// ChatScreen — STUB
// =============================================================================
// Port from prototype's ChatScreen (see /commonality.jsx).
//
// IMPORTANT change: the prototype uses `setInterval(loadChat, 2500)` to poll.
// REPLACE that entirely with the useChat hook:
//
//   const { chat, reload } = useChat(activeChatId);
//
// useChat subscribes to Postgres CDC via Supabase Realtime — new messages
// appear instantly with no polling.
//
// Other mechanical changes:
//   • `await safeSet(chatRow, ...)` for sending → `await chats.send(id, text)`
//   • `await safeSet` for ready/leave/save     → chats.ready/.leave/.save
//   • The simulateReply demo function is removed entirely.
//   • Server-side PII detection is authoritative — a 422 response means the
//     message was rejected, regardless of what the client previewed.
// =============================================================================

import type { UserSettings } from "@commonality/shared/types";
import type { Session } from "../hooks/useSession";

interface Props {
  activeChatId: string;
  setScreen: (s: string) => void;
  session: Session;
  settings: UserSettings;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function ChatScreen(_: Props) {
  return (
    <div className="p-6" style={{ color: "var(--text-primary)" }}>
      ChatScreen — port from prototype, use useChat hook
    </div>
  );
}
