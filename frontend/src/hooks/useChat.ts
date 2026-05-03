// =============================================================================
// useChat — load a chat + subscribe to realtime message inserts
// =============================================================================
// Replaces the prototype's 2.5s polling with a Postgres CDC subscription.
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { chats } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Chat, ChatMessage } from "@commonality/shared/types";

export function useChat(chatId: string | null) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!chatId) return;
    try {
      const c = await chats.get(chatId);
      setChat(c);
    } catch (e) {
      console.error("Chat load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    reload();
    if (!chatId) return;

    // Subscribe to new messages and chat-state changes via Supabase realtime.
    // RLS gates which rows we receive — only chats we participate in.
    const ch = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const m = payload.new as unknown as ChatMessage;
          setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, m] } : prev));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats", filter: `id=eq.${chatId}` },
        () => reload()
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [chatId, reload]);

  return { chat, loading, reload };
}
