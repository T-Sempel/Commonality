// =============================================================================
// App.tsx — top-level routing, theme, session
// =============================================================================

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useSession } from "./hooks/useSession";
import { useSettings } from "./hooks/useSettings";
import { themeCss } from "./lib/theme";
import AuthScreen from "./screens/AuthScreen";
import HomeScreen from "./screens/HomeScreen";
import ProfileScreen from "./screens/ProfileScreen";
import MatchesScreen from "./screens/MatchesScreen";
import ChatScreen from "./screens/ChatScreen";
import SavedChatsScreen from "./screens/SavedChatsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ModeratorDashboard from "./screens/ModeratorDashboard";

type Screen =
  | "auth"
  | "home"
  | "profile"
  | "matches"
  | "chat"
  | "savedChats"
  | "settings"
  | "modDashboard";

export default function App() {
  const { session, setSession, loading, logout, refresh } = useSession();
  const { settings, update: updateSettings, resolvedTheme } = useSettings(!!session);
  const [screen, setScreen] = useState<Screen>("auth");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind?: "info" | "error" | "success" } | null>(null);

  const showToast = (msg: string, kind: "info" | "error" | "success" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  // Route after login
  if (!loading && session && screen === "auth") {
    setScreen(session.role === "moderator" ? "modDashboard" : "home");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="text-stone-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div data-theme={resolvedTheme} style={{ background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <style>{themeCss}</style>

      <div
        className="max-w-md mx-auto min-h-screen relative"
        style={{
          background: "var(--bg-app)",
          borderLeft: "0.5px solid var(--border-soft)",
          borderRight: "0.5px solid var(--border-soft)",
        }}
      >
        {session?.role === "moderator" && (
          <div
            className="px-4 py-2 flex items-center gap-2 text-xs"
            style={{
              background: "var(--amber-bg)",
              borderBottom: "0.5px solid var(--amber-border)",
              color: "var(--amber)",
            }}
          >
            <ShieldAlert size={14} />
            <span className="font-medium">Moderator session</span>
            <span className="opacity-60">·</span>
            <span>You are reviewing reported content. You cannot send messages as users.</span>
          </div>
        )}

        {!session && <AuthScreen onAuthed={refresh} showToast={showToast} />}
        {session && screen === "home" && (
          <HomeScreen session={session} setScreen={setScreen} onLogout={logout} settings={settings} />
        )}
        {session && screen === "profile" && (
          <ProfileScreen setScreen={setScreen} showToast={showToast} />
        )}
        {session && screen === "matches" && (
          <MatchesScreen setScreen={setScreen} setActiveChatId={setActiveChatId} settings={settings} showToast={showToast} />
        )}
        {session && screen === "chat" && activeChatId && (
          <ChatScreen activeChatId={activeChatId} setScreen={setScreen} session={session} settings={settings} showToast={showToast} />
        )}
        {session && screen === "savedChats" && (
          <SavedChatsScreen setScreen={setScreen} setActiveChatId={setActiveChatId} session={session} />
        )}
        {session && screen === "settings" && (
          <SettingsScreen
            session={session}
            setScreen={setScreen}
            settings={settings}
            updateSettings={updateSettings}
            setSession={setSession}
            resolvedTheme={resolvedTheme}
            onLogout={logout}
            showToast={showToast}
          />
        )}
        {session?.role === "moderator" && screen === "modDashboard" && (
          <ModeratorDashboard onLogout={logout} showToast={showToast} session={session} />
        )}

        {toast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg max-w-sm text-center"
            style={{
              background: toast.kind === "error" ? "var(--rose-soft)" : toast.kind === "success" ? "var(--emerald-bg)" : "#1a1a18",
              color: toast.kind === "error" ? "var(--rose-text)" : toast.kind === "success" ? "var(--emerald-text)" : "#fff",
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
