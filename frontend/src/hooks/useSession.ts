// =============================================================================
// useSession — current authed user state
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { me, auth, ApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { User } from "@commonality/shared/types";

export interface Session {
  user: User & { email?: string };
  role: "user" | "moderator";
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await me.get();
      setSession({ user: u, role: u.role || "user" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
      } else {
        console.error("Session refresh failed:", e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Watch supabase auth state for token refreshes; on SIGNED_OUT clear session
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSession(null);
      if (event === "TOKEN_REFRESHED") refresh();
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [refresh]);

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
  }, []);

  return { session, setSession, loading, refresh, logout };
}
