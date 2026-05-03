import React, { useState, useEffect, useRef, useMemo } from "react";
import { Lock, Unlock, Shield, Flag, Ban, LogOut, Send, MessageCircle, Users, AlertTriangle, Check, X, ChevronRight, UserCircle, Eye, EyeOff, Sparkles, Heart, Coffee, Clock, Inbox, FileText, ShieldAlert, RotateCcw, UserX, History, Settings, Sun, Moon, Monitor, Bell, Trash2, RefreshCw, Pause, PlayCircle } from "lucide-react";
import {
  // Users
  createUser, getUser, updateUser, deleteUser, listUsers, listBannedUsers, listUsersWithProfiles,
  // Profiles & settings (aliased — they collide with React state setter names)
  getProfile, setProfile as setProfileDB, deleteProfile,
  getSettings, setSettings as setSettingsDB, deleteSettings,
  // Blocks
  getBlocks, addBlock, removeBlock, removeAllBlocksFor,
  // Matches & chats & messages
  getMatch, upsertMatch,
  getChat, createChat, updateChat, listChatsFor,
  sendMessage, listMessages,
  // Reports
  createReport, updateReport, listReports, getReport, listReportsForUser,
  // Realtime
  subscribeToChat, subscribeToUserChats,
  // Cleanup
  deleteAllChatsFor, wipeUser,
  // Constants
  MODERATOR_USER_ID,
} from "./supabase";

// ============================================================
// CONSTANTS — defined outside component so identity is stable
// ============================================================
const PROFILE_FIELDS = [
  { key: "ageRange", label: "Age range", options: ["18-24","25-34","35-44","45-54","55-64","65+"], sensitive: false },
  { key: "raceEthnicity", label: "Race or ethnicity", options: ["Asian","Black","Hispanic/Latino","Middle Eastern","Native American","Pacific Islander","White","Multiracial","Other"], sensitive: true },
  { key: "education", label: "Education", options: ["High school","Some college","Bachelor's","Master's","Doctorate","Trade/vocational","Self-taught"], sensitive: false },
  { key: "politics", label: "Political alignment", options: ["Very liberal","Liberal","Moderate","Conservative","Very conservative","Libertarian","Other","Apolitical"], sensitive: true },
  { key: "religion", label: "Religion", options: ["Christian","Muslim","Jewish","Hindu","Buddhist","Atheist","Agnostic","Spiritual","Other"], sensitive: true },
  { key: "socialClass", label: "Social class", options: ["Working class","Lower middle","Middle","Upper middle","Wealthy"], sensitive: true },
  { key: "pets", label: "Pets", options: ["Dog person","Cat person","Both","Other pets","No pets"], sensitive: false },
  { key: "phone", label: "Phone preference", options: ["iPhone","Android","Other"], sensitive: false },
  { key: "region", label: "Region type", options: ["Urban","Suburban","Rural","Small town"], sensitive: false },
  { key: "hobby", label: "Top hobby", options: ["Reading","Gaming","Cooking","Sports","Music","Art","Outdoors","Crafting","Tech"], sensitive: false },
  { key: "tvLike", label: "Favorite TV genre", options: ["Comedy/sitcoms","Drama","Reality","Sci-fi/fantasy","Documentary","True crime","Sports","Anime"], sensitive: false },
  { key: "food", label: "Comfort food", options: ["Italian","Mexican","Asian","BBQ","Soul food","Mediterranean","Vegetarian","Fast food"], sensitive: false },
];

const HANDLE_ADJ = ["Quiet","Curious","Wandering","Honest","Distant","Patient","Restless","Bright","Steady","Hidden","Open","Soft","Sharp","Calm","Earnest"];
const HANDLE_NOUN = ["Lantern","River","Window","Compass","Harbor","Field","Signal","Ember","Thread","Echo","Path","Stone","Branch","Tide","Breeze"];

const BANNED_PHRASES = ["kill yourself","kys","retard","faggot","n-word-slur","go die"];
const PII_PATTERNS = [
  { name: "email", re: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i },
  { name: "phone", re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: "url", re: /\b(https?:\/\/|www\.)\S+/i },
  { name: "handle", re: /@[a-zA-Z0-9_]{3,}/ },
];
const MOD_CODE = "MOD2024";

// Session is kept in localStorage so users stay signed in between visits.
const SESSION_KEY = "commonality.session";
const loadLocalSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
};
const saveLocalSession = (s) => {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
};

const genHandle = () => `${HANDLE_ADJ[Math.floor(Math.random()*HANDLE_ADJ.length)]} ${HANDLE_NOUN[Math.floor(Math.random()*HANDLE_NOUN.length)]}`;
const genId = () => Math.random().toString(36).slice(2,11);
const now = () => Date.now();

const defaultSettings = () => ({
  theme: "light",
  notifications: { newMatches: true, newMessages: true, modActions: true },
  privacy: { pauseMatching: false, requireBothReady: false, hideTraitTags: false },
  safety: { piiSensitivity: "standard" }, // "strict" | "standard" | "lenient"
  conversations: { autoSaveOnLeave: false, confirmBeforeLeave: true },
});

// Strip private fields before exposing a user to another user
function getPublicView(user, profile, sharedKeys, revealedKey) {
  if (!user) return null;
  const pub = { id: user.id, handle: user.handle, createdAt: user.createdAt };
  pub.shared = {};
  pub.revealed = null;
  if (profile) {
    sharedKeys.forEach(k => {
      if (profile[k]?.value && profile[k]?.optInMatch) pub.shared[k] = profile[k].value;
    });
    if (revealedKey && profile[revealedKey]?.optInReveal) {
      pub.revealed = { key: revealedKey, value: profile[revealedKey].value };
    }
  }
  return pub;
}

function detectViolations(text) {
  const issues = [];
  const lower = text.toLowerCase();
  BANNED_PHRASES.forEach(p => { if (lower.includes(p)) issues.push({ type: "harassment", phrase: p }); });
  PII_PATTERNS.forEach(p => { if (p.re.test(text)) issues.push({ type: "pii", kind: p.name }); });
  return issues;
}

function maskPII(text) {
  let out = text;
  PII_PATTERNS.forEach(p => { out = out.replace(p.re, `[${p.name} hidden]`); });
  return out;
}

// ============================================================
// MAIN APP
// ============================================================
export default function CommonalityApp() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("auth");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [resolvedTheme, setResolvedTheme] = useState("light");

  // Resolve theme: "system" follows the OS, others are explicit
  useEffect(() => {
    if (!settings) return;
    const apply = () => {
      if (settings.theme === "system") {
        const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        setResolvedTheme(dark ? "dark" : "light");
      } else {
        setResolvedTheme(settings.theme);
      }
    };
    apply();
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", apply);
      return () => mq.removeEventListener?.("change", apply);
    }
  }, [settings?.theme]);

  // Load session + settings on mount
  useEffect(() => {
    (async () => {
      const s = loadLocalSession();
      if (s) {
        const user = await getUser(s.userId);
        if (user && !user.banned) {
          setSession({ ...s, user });
          setScreen(s.role === "moderator" ? "modDashboard" : "home");
          const userSettings = await getSettings(s.userId);
          setSettings(userSettings || defaultSettings());
        } else {
          // Stored session is no longer valid (user deleted / banned).
          saveLocalSession(null);
          setSettings(defaultSettings());
        }
      } else {
        setSettings(defaultSettings());
      }
      setLoading(false);
    })();
  }, []);

  const updateSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (session?.userId) await setSettingsDB(session.userId, next);
  };

  const showToast = (msg, kind = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  const handleLogin = async (userId, role) => {
    const s = { userId, role, loginAt: now() };
    saveLocalSession(s);
    const user = await getUser(userId);
    setSession({ ...s, user });
    setScreen(role === "moderator" ? "modDashboard" : "home");
    const userSettings = await getSettings(userId);
    setSettings(userSettings || defaultSettings());
  };

  const handleLogout = async () => {
    saveLocalSession(null);
    setSession(null);
    setSettings(defaultSettings());
    setScreen("auth");
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="text-stone-500 text-sm">Loading…</div>
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen" data-theme={resolvedTheme} style={{
      background: "var(--bg-page)",
      fontFamily: "ui-sans-serif, system-ui",
      color: "var(--text-primary)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter:wght@300;400;500&display=swap');

        [data-theme="light"] {
          --bg-page: #faf9f6;
          --bg-app: #ffffff;
          --bg-card: #ffffff;
          --bg-elev: #fafaf7;
          --bg-soft: #f0ede5;
          --bg-input: #f0ede5;
          --bg-warm: #fdf3eb;
          --text-primary: #1a1a18;
          --text-secondary: #5a5a55;
          --text-tertiary: #8a8a85;
          --text-muted: #a8a29e;
          --border-soft: rgba(0,0,0,0.06);
          --border-mid: rgba(0,0,0,0.10);
          --border-strong: rgba(0,0,0,0.16);
          --sage: #2d4a42;
          --sage-mid: #4a7c6f;
          --sage-bg: #e8f2f0;
          --amber: #8b5e34;
          --amber-bg: #fdf3eb;
          --amber-border: #d4a574;
          --rose-soft: #fef2f2;
          --rose-text: #991b1b;
          --emerald-bg: #f0fdf4;
          --emerald-text: #166534;
          --emerald-border: #86efac;
          --shadow-card: 0 1px 2px rgba(0,0,0,0.04);
        }
        [data-theme="dark"] {
          --bg-page: #14130f;
          --bg-app: #1c1b17;
          --bg-card: #24221d;
          --bg-elev: #1f1d19;
          --bg-soft: #2a2722;
          --bg-input: #2a2722;
          --bg-warm: #2a201a;
          --text-primary: #ece7dd;
          --text-secondary: #a8a298;
          --text-tertiary: #7a7468;
          --text-muted: #5e594f;
          --border-soft: rgba(255,255,255,0.06);
          --border-mid: rgba(255,255,255,0.10);
          --border-strong: rgba(255,255,255,0.18);
          --sage: #6fa394;
          --sage-mid: #7aad9e;
          --sage-bg: #1f3530;
          --amber: #d4a574;
          --amber-bg: #2e2218;
          --amber-border: #6b4923;
          --rose-soft: #2a1818;
          --rose-text: #f4a8a8;
          --emerald-bg: #1a2a1f;
          --emerald-text: #86efac;
          --emerald-border: #2d5a3d;
          --shadow-card: 0 1px 2px rgba(0,0,0,0.4);
        }

        .font-display { font-family: 'Fraunces', Georgia, serif; }
        .font-body { font-family: 'Inter', system-ui, sans-serif; }
        body { font-family: 'Inter', system-ui, sans-serif; }

        /* Dark mode: remap Tailwind utility classes used throughout the app */
        [data-theme="dark"] .bg-white { background-color: var(--bg-card) !important; }
        [data-theme="dark"] .bg-stone-50 { background-color: var(--bg-elev) !important; }
        [data-theme="dark"] .bg-stone-100 { background-color: var(--bg-soft) !important; }
        [data-theme="dark"] .text-stone-300 { color: var(--text-muted) !important; }
        [data-theme="dark"] .text-stone-400 { color: var(--text-tertiary) !important; }
        [data-theme="dark"] .text-stone-500 { color: var(--text-secondary) !important; }
        [data-theme="dark"] .text-stone-600 { color: var(--text-secondary) !important; }
        [data-theme="dark"] .text-stone-900 { color: var(--text-primary) !important; }
        [data-theme="dark"] .border-stone-100 { border-color: var(--border-soft) !important; }
        [data-theme="dark"] .border-stone-200 { border-color: var(--border-mid) !important; }
        [data-theme="dark"] .hover\\:bg-stone-50:hover { background-color: var(--bg-elev) !important; }
        [data-theme="dark"] .bg-emerald-50 { background-color: var(--sage-bg) !important; }
        [data-theme="dark"] .text-emerald-900 { color: #aed5c9 !important; }
        [data-theme="dark"] .text-emerald-800 { color: #aed5c9 !important; }
        [data-theme="dark"] .border-emerald-700 { border-color: var(--sage-mid) !important; }
        [data-theme="dark"] .bg-amber-50 { background-color: var(--amber-bg) !important; }
        [data-theme="dark"] .text-amber-700 { color: var(--amber) !important; }
        [data-theme="dark"] .text-amber-800 { color: var(--amber) !important; }
        [data-theme="dark"] .text-amber-900 { color: #e8c190 !important; }
        [data-theme="dark"] .border-amber-200 { border-color: var(--amber-border) !important; }
        [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea {
          background-color: var(--bg-input) !important;
          color: var(--text-primary) !important;
        }
        [data-theme="dark"] input::placeholder, [data-theme="dark"] textarea::placeholder { color: var(--text-tertiary) !important; }
        [data-theme="dark"] .bg-rose-300 { background-color: #5a2a35 !important; }
        [data-theme="dark"] .text-rose-300 { color: #f4a8a8 !important; }
        [data-theme="dark"] .fill-rose-300 { fill: #f4a8a8 !important; }
        [data-theme="dark"] .bg-emerald-50 + * { color: inherit; }

        .grain { background-image: radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px); background-size: 3px 3px; }
        .reveal-anim { animation: reveal 0.9s cubic-bezier(.2,.8,.2,1) forwards; }
        @keyframes reveal { 0% { opacity: 0; transform: scale(0.92) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .pulse-soft { animation: pulse 2.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>

      <div className="max-w-md mx-auto min-h-screen relative shadow-sm" style={{
        background: "var(--bg-app)",
        borderLeft: "0.5px solid var(--border-soft)",
        borderRight: "0.5px solid var(--border-soft)",
      }}>
        {session?.role === "moderator" && (
          <div className="px-4 py-2 flex items-center gap-2 text-xs" style={{
            background: "var(--amber-bg)",
            borderBottom: "0.5px solid var(--amber-border)",
            color: isDark ? "#e8c190" : "#92400e",
          }}>
            <ShieldAlert size={14} />
            <span className="font-medium">Moderator session</span>
            <span className="opacity-60">·</span>
            <span>You are reviewing reported content. You cannot send messages as users.</span>
          </div>
        )}

        {screen === "auth" && <AuthScreen onLogin={handleLogin} showToast={showToast} />}
        {screen === "home" && session && <HomeScreen session={session} setScreen={setScreen} onLogout={handleLogout} showToast={showToast} settings={settings} />}
        {screen === "profile" && session && <ProfileScreen session={session} setScreen={setScreen} showToast={showToast} />}
        {screen === "matches" && session && <MatchesScreen session={session} setScreen={setScreen} setActiveChatId={setActiveChatId} showToast={showToast} settings={settings} />}
        {screen === "chat" && session && activeChatId && <ChatScreen session={session} setScreen={setScreen} activeChatId={activeChatId} showToast={showToast} settings={settings} />}
        {screen === "savedChats" && session && <SavedChatsScreen session={session} setScreen={setScreen} setActiveChatId={setActiveChatId} />}
        {screen === "settings" && session && <SettingsScreen session={session} setScreen={setScreen} settings={settings} updateSettings={updateSettings} setSession={setSession} showToast={showToast} resolvedTheme={resolvedTheme} onLogout={handleLogout} />}
        {screen === "modDashboard" && session?.role === "moderator" && <ModeratorDashboard session={session} onLogout={handleLogout} showToast={showToast} />}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg max-w-sm text-center" style={{
            background: toast.kind === "error" ? "var(--rose-soft)" : toast.kind === "success" ? "var(--emerald-bg)" : (isDark ? "#3a3833" : "#1a1a18"),
            color: toast.kind === "error" ? "var(--rose-text)" : toast.kind === "success" ? "var(--emerald-text)" : (isDark ? "#ece7dd" : "#fff"),
            border: toast.kind === "error" ? "0.5px solid #fecaca" : "none"
          }}>{toast.msg}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AUTH SCREEN — simplified for hackathon: one screen, just a handle.
// Full visual feel preserved (Fraunces, sage palette, soft cards).
// ============================================================
function AuthScreen({ onLogin, showToast }) {
  const [step, setStep] = useState("landing"); // landing | mod
  const [handle, setHandle] = useState(genHandle());
  const [modHandle, setModHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const enterAsUser = async () => {
    const trimmed = handle.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      showToast("Handle must be 3-30 characters", "error"); return;
    }
    setSubmitting(true);
    try {
      const newUser = await createUser(trimmed);
      onLogin(newUser.id, "user");
    } catch (e) {
      showToast("Could not sign in — check your Supabase setup", "error");
      console.error(e);
      setSubmitting(false);
    }
  };

  const enterAsModerator = async () => {
    if (modHandle !== "MOD2024") { showToast("Invalid moderator code", "error"); return; }
    onLogin(MODERATOR_USER_ID, "moderator");
  };

  // ---------- LANDING (single screen with handle entry) ----------
  if (step === "landing") {
    return (
      <div className="px-6 pt-16 pb-8 min-h-screen flex flex-col">
        <div className="mb-auto">
          <div className="font-display text-5xl tracking-tight leading-none" style={{ color: "var(--sage)" }}>
            Commonality
          </div>
          <div className="text-base mt-3 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 320 }}>
            Meet through what you share.<br/>Then talk about one thing you don't.
          </div>

          <div className="mt-10 space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            <div className="flex items-start gap-2.5">
              <div className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage-mid)" }} />
              <div>Conversations are anonymous to other users</div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage-mid)" }} />
              <div>One difference at a time, only after trust is built</div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage-mid)" }} />
              <div>You can leave any conversation at any time</div>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <label className="text-xs uppercase tracking-wider mb-2 font-medium block" style={{ color: "var(--text-tertiary)" }}>
            Your anonymous handle
          </label>
          <div className="flex items-center gap-2 mb-3">
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !submitting && enterAsUser()}
              placeholder="Pick a handle"
              maxLength={30}
              className="flex-1 px-4 py-3 rounded-xl outline-none transition"
              style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)", fontSize: 15, color: "var(--text-primary)" }}
            />
            <button
              onClick={() => setHandle(genHandle())}
              title="Regenerate"
              className="p-3 rounded-xl transition hover:opacity-80"
              style={{ background: "var(--bg-soft)", color: "var(--text-secondary)" }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="text-[11px] mb-4" style={{ color: "var(--text-tertiary)" }}>
            Other users only ever see this. You can change it later in settings.
          </div>

          <button
            onClick={enterAsUser}
            disabled={submitting || !handle.trim()}
            className="w-full py-3.5 rounded-xl font-medium text-white transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "var(--sage)" }}
          >
            <Sparkles size={15} /> {submitting ? "Entering…" : "Enter Commonality"}
          </button>
        </div>

        <button onClick={() => setStep("mod")} className="mt-6 text-xs flex items-center gap-1.5 self-center hover:opacity-70" style={{ color: "var(--text-tertiary)" }}>
          <Shield size={12} /> Moderator access
        </button>
      </div>
    );
  }

  // ---------- MOD LOGIN ----------
  if (step === "mod") {
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col">
        <button onClick={() => setStep("landing")} className="text-sm flex items-center gap-1 self-start mb-8 hover:opacity-70" style={{ color: "var(--text-tertiary)" }}>
          <ChevronRight size={14} className="rotate-180" /> Back
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} style={{ color: "var(--amber)" }} />
          <div className="font-medium">Moderator login</div>
        </div>
        <div className="text-xs mb-6" style={{ color: "var(--text-secondary)" }}>
          Moderators have read-only access to reported conversations. They cannot post as users or view personal account details beyond what is required for enforcement actions.
        </div>
        <input
          type="password"
          value={modHandle}
          onChange={e => setModHandle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enterAsModerator()}
          placeholder="Moderator access code"
          className="w-full px-4 py-3 rounded-xl outline-none"
          style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>Demo code: <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-soft)" }}>MOD2024</code></div>
        <button onClick={enterAsModerator} className="mt-6 w-full py-3.5 rounded-xl font-medium text-white" style={{ background: "var(--amber)" }}>
          Enter dashboard
        </button>
      </div>
    );
  }

  return null;
}

// ============================================================
// HOME / NAV
// ============================================================
function HomeScreen({ session, setScreen, onLogout, showToast, settings }) {
  const [profile, setProfile] = useState(null);
  const [activeChats, setActiveChats] = useState([]);

  const loadHome = async () => {
    const p = await getProfile(session.userId);
    setProfile(p);
    const all = await listChatsFor(session.userId);
    setActiveChats(all.filter(c => !c.endedBy));
  };

  useEffect(() => {
    loadHome();
    // Live-refresh when any chat the user participates in changes.
    const unsub = subscribeToUserChats(session.userId, () => loadHome());
    return unsub;
  }, [session.userId]);

  const filledFields = profile ? Object.keys(profile).filter(k => profile[k]?.value).length : 0;
  const totalFields = PROFILE_FIELDS.length;
  const matchingPaused = settings?.privacy?.pauseMatching;

  return (
    <div className="px-6 pt-8 pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Signed in as</div>
          <div className="font-display text-2xl mt-0.5">{session.user.handle}</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Anonymous to others</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setScreen("settings")} className="p-2 hover:opacity-70 transition" style={{ color: "var(--text-tertiary)" }} title="Settings"><Settings size={18} /></button>
          <button onClick={onLogout} className="p-2 hover:opacity-70 transition" style={{ color: "var(--text-tertiary)" }} title="Log out"><LogOut size={18} /></button>
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-3" style={{ background: "linear-gradient(135deg, var(--sage), var(--sage-mid))" }}>
        <div className="text-xs uppercase tracking-wider opacity-80" style={{ color: "#e8f2f0" }}>Profile</div>
        <div className="font-display text-xl mt-1" style={{ color: "white" }}>{filledFields} of {totalFields} fields</div>
        <div className="text-xs opacity-80 mt-1" style={{ color: "#e8f2f0" }}>More fields → better matches. Each field is opt-in.</div>
        <button onClick={() => setScreen("profile")} className="mt-4 px-4 py-2 rounded-full text-sm font-medium hover:bg-white/25 backdrop-blur flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
          {filledFields === 0 ? "Set up profile" : "Edit profile"} <ChevronRight size={14} />
        </button>
      </div>

      {matchingPaused && (
        <div className="rounded-xl p-3 mb-3 flex items-center gap-2" style={{ background: "var(--amber-bg)", border: "0.5px solid var(--amber-border)" }}>
          <Pause size={14} style={{ color: "var(--amber)" }} />
          <div className="text-xs flex-1" style={{ color: "var(--amber)" }}>Matching is paused. You won't appear in others' queues.</div>
          <button onClick={() => setScreen("settings")} className="text-xs underline" style={{ color: "var(--amber)" }}>Resume</button>
        </div>
      )}

      <button onClick={() => setScreen("matches")} disabled={matchingPaused} className="w-full rounded-2xl p-5 text-left transition disabled:opacity-50" style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users size={16} style={{ color: "var(--sage-mid)" }} />
              <div className="font-medium">Find a conversation</div>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Match anonymously by what you share</div>
          </div>
          <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>
      </button>

      <button onClick={() => setScreen("savedChats")} className="w-full mt-3 rounded-2xl p-5 text-left transition" style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MessageCircle size={16} style={{ color: "var(--sage-mid)" }} />
              <div className="font-medium">Your conversations</div>
              {activeChats.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--sage-bg)", color: "var(--sage)" }}>{activeChats.length} active</span>}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Saved and ongoing chats</div>
          </div>
          <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>
      </button>

      <button onClick={() => setScreen("settings")} className="w-full mt-3 rounded-2xl p-5 text-left transition" style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Settings size={16} style={{ color: "var(--sage-mid)" }} />
              <div className="font-medium">Settings</div>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Theme, privacy, blocked users, and more</div>
          </div>
          <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
        </div>
      </button>

      <div className="mt-8 p-4 rounded-2xl" style={{ background: "var(--amber-bg)" }}>
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5" style={{ color: "var(--amber)" }} />
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--amber)" }}>House rules</div>
            <ul className="text-xs mt-1 space-y-0.5" style={{ color: "var(--amber)", opacity: 0.85 }}>
              <li>· No real names, locations, workplaces, or contact info</li>
              <li>· Conversation, not debate</li>
              <li>· One difference at a time</li>
              <li>· Easy exit at any moment</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROFILE SCREEN
// ============================================================
function ProfileScreen({ session, setScreen, showToast }) {
  const [profile, setProfile] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getProfile(session.userId);
      setProfile(p || {});
    })();
  }, [session.userId]);

  const updateField = (key, patch) => {
    setProfile(prev => ({ ...prev, [key]: { ...(prev[key] || { optInMatch: false, optInReveal: false }), ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    await setProfileDB(session.userId, profile);
    setSaving(false);
    showToast("Profile saved", "success");
    setScreen("home");
  };

  return (
    <div className="pb-24">
      <Header title="Your profile" subtitle="Optional. Each field is opt-in." onBack={() => setScreen("home")} />

      <div className="px-6">
        <div className="p-3 rounded-xl mb-5 text-xs leading-relaxed" style={{ background: "#f0ede5", color: "#5a5a55" }}>
          <div className="flex gap-1.5"><Eye size={12} className="mt-0.5 shrink-0" />
          <span><strong>Match</strong> uses the field to find common ground. <strong>Reveal</strong> allows it to be shown after a conversation builds. Sensitive fields require both.</span></div>
        </div>

        {PROFILE_FIELDS.map(field => {
          const f = profile[field.key] || {};
          return (
            <div key={field.key} className="mb-4 p-4 rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.10)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">{field.label}</div>
                {field.sensitive && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">sensitive</span>}
              </div>
              <select
                value={f.value || ""}
                onChange={e => updateField(field.key, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-white outline-none"
                style={{ border: "0.5px solid rgba(0,0,0,0.12)" }}
              >
                <option value="">— skip —</option>
                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>

              {f.value && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                    <input type="checkbox" checked={!!f.optInMatch} onChange={e => updateField(field.key, { optInMatch: e.target.checked })} className="rounded" style={{ accentColor: "#4a7c6f" }} />
                    Use for finding shared commonalities
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                    <input type="checkbox" checked={!!f.optInReveal} onChange={e => updateField(field.key, { optInReveal: e.target.checked })} className="rounded" style={{ accentColor: "#c4804a" }} />
                    Allow as a difference reveal
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
        <button onClick={save} disabled={saving} className="w-full py-3.5 rounded-xl font-medium text-white disabled:opacity-50" style={{ background: "#2d4a42" }}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MATCHES SCREEN
// ============================================================
function MatchesScreen({ session, setScreen, setActiveChatId, showToast, settings }) {
  const [profile, setProfile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const matchingPaused = settings?.privacy?.pauseMatching;

  useEffect(() => {
    (async () => {
      const myProfile = (await getProfile(session.userId)) || {};
      setProfile(myProfile);
      const blocked = await getBlocks(session.userId);
      const all = await listUsersWithProfiles();
      const cands = [];
      for (const { user: u, profile: theirProfile } of all) {
        if (!u || u.id === session.userId || u.banned || u.role === "moderator") continue;
        if (blocked.includes(u.id)) continue;
        // Find shared keys (both opted in for match, same value)
        const shared = [];
        const theirRevealable = [];
        Object.keys(theirProfile).forEach(key => {
          const mine = myProfile[key];
          const theirs = theirProfile[key];
          if (mine?.optInMatch && theirs?.optInMatch && mine.value && theirs.value && mine.value === theirs.value) {
            shared.push({ key, value: mine.value, label: PROFILE_FIELDS.find(f => f.key === key)?.label || key });
          }
          if (theirs?.optInReveal && mine?.optInReveal && theirs.value !== mine?.value) {
            theirRevealable.push({ key, label: PROFILE_FIELDS.find(f => f.key === key)?.label || key });
          }
        });
        if (shared.length >= 1 && theirRevealable.length >= 1) {
          const futureCat = theirRevealable[0];
          cands.push({ user: u, shared, futureCat });
        }
      }
      setCandidates(cands);
      setLoading(false);
    })();
  }, [session.userId]);

  const proposeMatch = async (cand) => {
    const matchId = `${[session.userId, cand.user.id].sort().join("_")}`;
    const existing = await getMatch(matchId);
    if (existing?.bothAgreed) {
      showToast("Match already accepted — opening chat", "success");
      await openChat(matchId, cand);
      return;
    }
    // For demo: auto-accept on the other side
    await upsertMatch({
      id: matchId,
      a: session.userId,
      b: cand.user.id,
      shared: cand.shared,
      futureCat: cand.futureCat,
      proposedAt: now(),
      aAgreed: true,
      bAgreed: true,
      bothAgreed: true,
    });
    showToast(`${cand.user.handle} agreed to chat`, "success");
    await openChat(matchId, cand);
  };

  const openChat = async (matchId, cand) => {
    const chatId = `chat_${matchId}`;
    let chat = await getChat(chatId);
    if (!chat) {
      // Determine reveal key — must be opt-in-reveal on BOTH sides if exists
      const myProfile = (await getProfile(session.userId)) || {};
      const theirProfile = (await getProfile(cand.user.id)) || {};
      let revealKey = cand.futureCat.key;
      if (!myProfile[revealKey]?.optInReveal || !theirProfile[revealKey]?.optInReveal) {
        const bothReveal = Object.keys(theirProfile).find(k =>
          theirProfile[k]?.optInReveal && myProfile[k]?.optInReveal && theirProfile[k].value !== myProfile[k]?.value
        );
        revealKey = bothReveal || null;
      }
      await createChat({
        id: chatId,
        matchId,
        participants: [session.userId, cand.user.id],
        handles: { [session.userId]: session.user.handle, [cand.user.id]: cand.user.handle },
        shared: cand.shared,
        revealKey,
        revealValues: revealKey ? { [session.userId]: myProfile[revealKey]?.value, [cand.user.id]: theirProfile[revealKey]?.value } : null,
        revealLabel: revealKey ? PROFILE_FIELDS.find(f => f.key === revealKey)?.label : null,
        unlocked: false,
        readyConfirmed: { [session.userId]: false, [cand.user.id]: false },
        createdAt: now(),
        savedBy: [],
      });
    }
    setActiveChatId(chatId);
    setScreen("chat");
  };

  return (
    <div>
      <Header title="Possible matches" subtitle="People you share something with" onBack={() => setScreen("home")} />
      <div className="px-6 pb-8">
        {loading && <div className="text-sm text-stone-400 py-12 text-center">Looking for shared ground…</div>}
        {!loading && candidates.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="text-stone-300 mb-2"><Users size={32} className="mx-auto" /></div>
            <div className="text-sm text-stone-600 font-medium">No matches yet</div>
            <div className="text-xs text-stone-400 mt-1">Add more profile fields and opt them in for matching.</div>
            <button onClick={() => setScreen("profile")} className="mt-4 px-4 py-2 text-sm rounded-full" style={{ background: "#2d4a42", color: "white" }}>Edit profile</button>
          </div>
        )}
        {!loading && candidates.map(c => (
          <div key={c.user.id} className="mb-3 p-4 rounded-2xl bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.10)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-display text-lg">{c.user.handle}</div>
                <div className="text-[11px] text-stone-400 uppercase tracking-wider">Anonymous</div>
              </div>
              <div className="text-[11px] text-stone-400">{c.shared.length} in common</div>
            </div>

            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Shared</div>
              <div className="flex flex-wrap gap-1.5">
                {c.shared.map(s => (
                  <span key={s.key} className="text-xs px-2.5 py-1 rounded-full" style={{ background: "#e8f2f0", color: "#2d4a42" }}>
                    {s.value}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-3 p-2.5 rounded-lg flex items-center gap-2" style={{ background: "#fdf3eb" }}>
              <Lock size={12} style={{ color: "#8b5e34" }} />
              <div className="text-xs" style={{ color: "#7a5536" }}>
                <span className="font-medium">Later reveal:</span> {c.futureCat.label.toLowerCase()}
              </div>
            </div>

            <button onClick={() => proposeMatch(c)} className="w-full py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-90" style={{ background: "#2d4a42" }}>
              Propose conversation
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CHAT SCREEN
// ============================================================
function ChatScreen({ session, setScreen, activeChatId, showToast, settings }) {
  const [chat, setChat] = useState(null);
  const [text, setText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [revealAnimating, setRevealAnimating] = useState(false);
  const scrollRef = useRef(null);

  const chatId = activeChatId;
  const otherUserRoleRef = useRef(null); // cached role of the other participant ("user" | "demo")

  // Initial load + realtime subscriptions (replaces 2.5s polling).
  useEffect(() => {
    let cancelled = false;
    if (!chatId) { setScreen("home"); return; }
    (async () => {
      const c = await getChat(chatId);
      if (cancelled) return;
      if (!c) { setScreen("home"); return; }
      setChat(c);
      // Cache the other participant's role so we know whether to auto-reply.
      const otherId = c.participants.find(p => p !== session.userId);
      if (otherId) {
        const otherUser = await getUser(otherId);
        otherUserRoleRef.current = otherUser?.role || "user";
      }
    })();

    // Subscribe to chat-row changes (unlocked, ended, ready, savedBy, etc.)
    // and to new message INSERTs. Both pipe back into local state.
    const unsub = subscribeToChat(
      chatId,
      (updatedChat) => {
        // updatedChat from the realtime payload doesn't include messages,
        // so preserve the existing messages array.
        setChat(prev => prev ? { ...updatedChat, messages: prev.messages } : updatedChat);
      },
      (newMessage) => {
        setChat(prev => {
          if (!prev) return prev;
          if (prev.messages?.some(m => m.id === newMessage.id)) return prev; // dedup
          return { ...prev, messages: [...(prev.messages || []), newMessage] };
        });
      }
    );

    return () => { cancelled = true; unsub(); };
  }, [chatId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat?.messages?.length]);

  // Check unlock conditions
  useEffect(() => {
    if (!chat || chat.unlocked) return;
    const myMsgs = chat.messages.filter(m => m.from === session.userId).length;
    const theirMsgs = chat.messages.filter(m => m.from !== session.userId).length;
    const totalMsgs = chat.messages.length;
    const elapsed = now() - chat.createdAt;
    const bothReady = chat.readyConfirmed && Object.values(chat.readyConfirmed).every(v => v);
    if (settings?.privacy?.requireBothReady) {
      if (bothReady) doReveal();
      return;
    }
    if ((totalMsgs >= 6 && myMsgs >= 2 && theirMsgs >= 2) || elapsed > 5*60*1000 || bothReady) {
      doReveal();
    }
  }, [chat?.messages?.length, chat?.readyConfirmed]);

  const doReveal = async () => {
    if (!chat || chat.unlocked) return;
    await updateChat(chatId, { unlocked: true, unlockedAt: now() });
    setChat(prev => prev ? { ...prev, unlocked: true, unlockedAt: now() } : prev);
    setRevealAnimating(true);
    setTimeout(() => setRevealAnimating(false), 1500);
  };

  const send = async () => {
    if (!text.trim() || !chat) return;

    // Rate limit for new accounts
    const accountAge = now() - session.user.createdAt;
    if (accountAge < 60*60*1000) {
      const recent = chat.messages.filter(m => m.from === session.userId && (now() - m.at) < 60000).length;
      if (recent >= 10) { showToast("New accounts are limited to 10 messages/min", "error"); return; }
    }

    // Detect violations
    const violations = detectViolations(text);
    let displayText = text;
    let warning = null;

    const harassment = violations.find(v => v.type === "harassment");
    if (harassment) {
      // auto-create a high-severity report
      const reportId = `rep_${genId()}`;
      await createReport({
        id: reportId, chatId, reportedUser: session.userId, reportedBy: "system",
        reason: "auto_harassment", severity: "high",
        excerpt: text.slice(0,200), at: now(), status: "pending",
      });
      // increment user warnings
      await updateUser(session.userId, { warnings: (session.user.warnings || 0) + 1 });
      showToast("Message blocked: harassment detected. Reported to moderators.", "error");
      setText("");
      return;
    }

    const piiSensitivity = settings?.safety?.piiSensitivity || "standard";
    const piiViolation = violations.find(v => v.type === "pii");
    if (piiViolation) {
      if (piiSensitivity === "strict") {
        showToast("Message blocked: contains personal info. Edit and try again.", "error");
        return;
      } else if (piiSensitivity === "lenient") {
        warning = "Heads up: this looks like personal info";
      } else {
        displayText = maskPII(text);
        warning = "PII auto-hidden";
      }
    }

    // Insert into messages table — realtime will broadcast to both clients.
    // Optimistically append locally so the sender sees it instantly.
    const optimistic = { id: `tmp_${genId()}`, from: session.userId, text: displayText, at: now(), warning };
    setChat(prev => prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev);
    setText("");
    if (warning) showToast(warning, "info");
    try {
      const real = await sendMessage(chatId, session.userId, displayText, warning);
      // Replace optimistic with the real message (matched by id).
      setChat(prev => {
        if (!prev) return prev;
        const msgs = prev.messages.map(m => m.id === optimistic.id ? real : m);
        // dedup if realtime already delivered it
        const seen = new Set();
        const deduped = msgs.filter(m => seen.has(m.id) ? false : (seen.add(m.id), true));
        return { ...prev, messages: deduped };
      });
    } catch (e) {
      console.error(e);
      showToast("Could not send", "error");
    }

    // ONLY simulate a reply if the other participant is a seeded demo user.
    // For real users, the other side will reply on their own.
    if (otherUserRoleRef.current === "demo") {
      setTimeout(() => simulateDemoReply(), 1200 + Math.random() * 1500);
    }
  };

  const simulateDemoReply = async () => {
    const fresh = await getChat(chatId);
    if (!fresh || fresh.endedBy) return;
    const otherId = fresh.participants.find(p => p !== session.userId);
    const replies = fresh.unlocked ? [
      "That's an interesting way to look at it. I hadn't thought of it that way.",
      "What made you start feeling that way? I'm trying to understand.",
      "I see where you're coming from, even if I land somewhere different.",
      "That's fair. Where I differ is mostly in how I weigh tradeoffs.",
    ] : [
      "Yeah, completely. The third season especially.",
      "Same here. What got you into it originally?",
      "Ha, classic. I don't think people give that one enough credit.",
      "Agreed. There's something about it that just feels honest.",
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    await sendMessage(chatId, otherId, reply, null);
    // Realtime subscription will deliver it to our local state.
  };

  const confirmReady = async () => {
    if (!chat) return;
    // Only flip our own bit; the other user flips theirs from their client.
    const fresh = await getChat(chatId);
    if (!fresh) return;
    const nextReady = { ...fresh.readyConfirmed, [session.userId]: true };
    await updateChat(chatId, { readyConfirmed: nextReady });
    setChat(prev => prev ? { ...prev, readyConfirmed: nextReady } : prev);

    // If the other participant is a demo user, auto-flip their bit too.
    const otherId = fresh.participants.find(p => p !== session.userId);
    if (otherUserRoleRef.current === "demo" && otherId) {
      const both = { ...nextReady, [otherId]: true };
      await updateChat(chatId, { readyConfirmed: both });
    }
  };

  const leave = async (skipConfirm) => {
    if (!chat) return;
    if (settings?.conversations?.confirmBeforeLeave && !skipConfirm) {
      if (!window.confirm("Leave this conversation? It will end for both of you.")) return;
    }
    const autoSave = settings?.conversations?.autoSaveOnLeave;
    const savedBy = autoSave && !chat.savedBy.includes(session.userId)
      ? [...chat.savedBy, session.userId]
      : chat.savedBy;
    await updateChat(chatId, { endedBy: session.userId, endedAt: now(), savedBy });
    showToast(autoSave ? "Left and saved" : "You left the conversation", "info");
    setScreen("home");
  };

  const save = async () => {
    if (!chat) return;
    const savedBy = chat.savedBy.includes(session.userId) ? chat.savedBy : [...chat.savedBy, session.userId];
    await updateChat(chatId, { savedBy });
    setChat(prev => prev ? { ...prev, savedBy } : prev);
    showToast("Conversation saved", "success");
  };

  const block = async () => {
    if (!chat) return;
    const otherId = chat.participants.find(p => p !== session.userId);
    await addBlock(session.userId, otherId);
    await updateChat(chatId, { endedBy: session.userId, endedAt: now() });
    showToast("User blocked. Conversation ended.", "info");
    setScreen("home");
  };

  if (!chat) return <div className="p-12 text-center text-stone-400 text-sm">Loading…</div>;

  const otherId = chat.participants.find(p => p !== session.userId);
  const otherHandle = chat.handles[otherId];
  const myReady = chat.readyConfirmed?.[session.userId];

  const minutesUntil = Math.max(0, Math.ceil((chat.createdAt + 5*60*1000 - now())/60000));
  const messagesUntil = Math.max(0, 6 - chat.messages.length);

  return (
    <div className="flex flex-col" style={{ height: "100vh", maxHeight: "100vh" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.10)" }}>
        <button onClick={() => setScreen("home")} className="text-stone-500 text-sm flex items-center gap-1"><ChevronRight size={16} className="rotate-180" /></button>
        <div className="text-center">
          <div className="font-medium text-sm">{otherHandle}</div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400">Anonymous</div>
        </div>
        <button onClick={() => setReportOpen(true)} className="text-stone-400 hover:text-stone-600"><Flag size={15} /></button>
      </div>

      {!settings?.privacy?.hideTraitTags && (
        <div className="px-4 py-2 flex flex-wrap gap-1" style={{ background: "var(--bg-elev)", borderBottom: "0.5px solid var(--border-soft)" }}>
          <span className="text-[10px] mr-1 uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>shared</span>
          {chat.shared.map(s => (
            <span key={s.key} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--sage-bg)", color: "var(--sage)" }}>{s.value}</span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: "var(--bg-elev)" }}>
        {chat.messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-xs text-stone-500 mb-2">Start the conversation</div>
            <div className="text-[11px] text-stone-400 italic">Tip: Ask about something you both noted as shared.</div>
          </div>
        )}
        {chat.messages.map(m => {
          const mine = m.from === session.userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? "rounded-br-md" : "rounded-bl-md"}`}
                style={{ background: mine ? "#2d4a42" : "white", color: mine ? "white" : "#1a1a18", border: mine ? "none" : "0.5px solid rgba(0,0,0,0.08)" }}>
                {m.text}
                {m.warning && <div className="text-[10px] mt-1 opacity-70 italic">{m.warning}</div>}
              </div>
            </div>
          );
        })}

        {!chat.unlocked && (
          <div className="my-4 p-3 rounded-xl text-center" style={{ background: "#f9f7f3", border: "0.5px dashed #d4c9b5" }}>
            <Lock size={14} className="inline mb-1" style={{ color: "#8b5e34" }} />
            <div className="text-xs font-medium mt-1" style={{ color: "#5c3a1f" }}>One difference is still locked</div>
            <div className="text-[11px] mt-1" style={{ color: "#7a5536" }}>
              Unlocks after {messagesUntil > 0 ? `${messagesUntil} more messages` : "next message"} · or {minutesUntil} more min · or both ready
            </div>
            {!myReady && chat.messages.length >= 2 && (
              <button onClick={confirmReady} className="mt-2 text-xs px-3 py-1 rounded-full" style={{ background: "#8b5e34", color: "white" }}>I'm ready to see it</button>
            )}
            {myReady && <div className="text-[11px] mt-2 italic" style={{ color: "#7a5536" }}>Waiting for {otherHandle}…</div>}
          </div>
        )}

        {chat.unlocked && chat.revealKey && (
          <div className={`my-4 p-4 rounded-2xl ${revealAnimating ? "reveal-anim" : ""}`} style={{ background: "linear-gradient(135deg, #fdf3eb, #f5e6d3)", border: "0.5px solid #d4a574" }}>
            <div className="flex items-center gap-2 mb-2">
              <Unlock size={14} style={{ color: "#8b5e34" }} />
              <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "#5c3a1f" }}>One difference revealed</div>
            </div>
            <div className="text-xs mb-3" style={{ color: "#7a5536" }}>{chat.revealLabel}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-white/60">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">You</div>
                <div className="text-sm font-medium mt-0.5">{chat.revealValues[session.userId] || "—"}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/60">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">{otherHandle}</div>
                <div className="text-sm font-medium mt-0.5">{chat.revealValues[otherId] || "—"}</div>
              </div>
            </div>
            <div className="text-[11px] italic mt-3" style={{ color: "#7a5536" }}>Take it slow. Curiosity, not debate.</div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "0.5px solid rgba(0,0,0,0.10)" }}>
        <button onClick={save} title="Save" className="p-2 text-stone-400 hover:text-stone-600"><Heart size={16} /></button>
        <button onClick={leave} title="Leave" className="p-2 text-stone-400 hover:text-stone-600"><LogOut size={16} /></button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={chat.endedBy ? "Conversation ended" : "Write a message…"}
          disabled={!!chat.endedBy}
          className="flex-1 px-4 py-2.5 rounded-full outline-none text-sm disabled:opacity-50"
          style={{ background: "#f0ede5", border: "none" }}
        />
        <button onClick={send} disabled={!text.trim() || !!chat.endedBy} className="p-2.5 rounded-full text-white disabled:opacity-30" style={{ background: "#2d4a42" }}>
          <Send size={14} />
        </button>
      </div>

      {reportOpen && (
        <ReportModal
          chat={chat}
          session={session}
          onClose={() => setReportOpen(false)}
          onBlock={block}
          onLeave={leave}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function ReportModal({ chat, session, onClose, onBlock, onLeave, showToast }) {
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) { showToast("Pick a reason", "error"); return; }
    setSubmitting(true);
    const otherId = chat.participants.find(p => p !== session.userId);
    const reportId = `rep_${genId()}`;
    // Excerpt = last few messages from the reported user only (privacy: don't include the reporter's content)
    const excerpt = chat.messages.filter(m => m.from === otherId).slice(-3).map(m => m.text).join(" / ").slice(0,300);
    await createReport({
      id: reportId, chatId: chat.id, reportedUser: otherId, reportedBy: session.userId,
      reason, severity, excerpt, at: now(), status: "pending",
      sharedTraits: chat.shared.map(s => s.value),
    });
    setSubmitting(false);
    onClose();
    showToast("Reported. A moderator will review.", "success");
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full bg-white rounded-t-3xl p-5 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-xl">Report or block</div>
          <button onClick={onClose} className="text-stone-400"><X size={20} /></button>
        </div>
        <div className="text-xs text-stone-500 mb-4">Reports are reviewed by moderators. They will see relevant messages but not your account email.</div>

        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-2">Reason</div>
        <div className="space-y-1.5 mb-4">
          {["Harassment or hate","Sharing personal info","Spam or scam","Made me feel unsafe","Other"].map(r => (
            <button key={r} onClick={() => setReason(r)} className={`w-full p-2.5 rounded-lg text-left text-sm ${reason === r ? "bg-emerald-50 border-emerald-700" : "bg-stone-50 border-transparent"}`} style={{ border: "1px solid", borderColor: reason === r ? "#4a7c6f" : "transparent" }}>
              {r}
            </button>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-2">Severity</div>
        <div className="flex gap-2 mb-4">
          {["low","medium","high"].map(s => (
            <button key={s} onClick={() => setSeverity(s)} className={`flex-1 py-2 rounded-lg text-sm capitalize ${severity===s ? "bg-stone-900 text-white" : "bg-stone-100"}`}>{s}</button>
          ))}
        </div>

        <button onClick={submit} disabled={!reason || submitting} className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-50 mb-2" style={{ background: "#a14545" }}>
          Submit report
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onBlock} className="py-2.5 rounded-xl text-sm font-medium" style={{ background: "#fef2f2", color: "#991b1b" }}>Block user</button>
          <button onClick={onLeave} className="py-2.5 rounded-xl text-sm font-medium" style={{ background: "#f0ede5" }}>Leave only</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SAVED CHATS
// ============================================================
function SavedChatsScreen({ session, setScreen, setActiveChatId }) {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    (async () => {
      const mine = await listChatsFor(session.userId);
      mine.sort((a,b) => b.createdAt - a.createdAt);
      setChats(mine);
    })();
  }, [session.userId]);

  const open = (chat) => {
    setActiveChatId(chat.id);
    setScreen("chat");
  };

  return (
    <div>
      <Header title="Your conversations" subtitle="Active and saved" onBack={() => setScreen("home")} />
      <div className="px-6 pb-12">
        {chats.length === 0 && <div className="text-sm text-stone-400 text-center py-12">No conversations yet</div>}
        {chats.map(c => {
          const otherId = c.participants.find(p => p !== session.userId);
          const lastMsg = c.messages[c.messages.length - 1];
          return (
            <button key={c.id} onClick={() => open(c)} className="w-full text-left p-4 rounded-2xl mb-2 hover:bg-stone-50 transition" style={{ border: "0.5px solid rgba(0,0,0,0.10)" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-display">{c.handles[otherId]}</div>
                <div className="flex items-center gap-1">
                  {c.savedBy?.includes(session.userId) && <Heart size={11} className="fill-rose-300 text-rose-300" />}
                  {c.unlocked ? <Unlock size={11} className="text-amber-700" /> : <Lock size={11} className="text-stone-400" />}
                  {c.endedBy && <span className="text-[10px] text-stone-400 uppercase tracking-wider">ended</span>}
                </div>
              </div>
              <div className="text-xs text-stone-500 line-clamp-1">{lastMsg?.text || "No messages yet"}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.shared.slice(0,3).map(s => <span key={s.key} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#e8f2f0", color: "#2d4a42" }}>{s.value}</span>)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MODERATOR DASHBOARD — completely separate UI/permissions
// ============================================================
function ModeratorDashboard({ session, onLogout, showToast }) {
  const [tab, setTab] = useState("pending");
  const [reports, setReports] = useState([]);
  const [suspendedUsers, setSuspendedUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const all = await listReports();
    all.sort((a,b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return sevOrder[a.severity] - sevOrder[b.severity];
    });
    setReports(all);

    // Build suspended-user list, stripping email/provider for moderator view
    const bannedRaw = await listBannedUsers();
    const banned = bannedRaw
      .filter(u => u.role !== "moderator")
      .map(u => {
        // Find most recent enforcement report for context
        const lastReport = all
          .filter(r => r.reportedUser === u.id && (r.status === "suspended" || r.status === "blocked"))
          .sort((a,b) => (b.reviewedAt || 0) - (a.reviewedAt || 0))[0];
        return {
          id: u.id,
          handle: u.handle,
          createdAt: u.createdAt,
          warnings: u.warnings || 0,
          bannedAt: u.bannedAt,
          bannedReason: u.bannedReason,
          lastReport,
        };
      });
    banned.sort((a,b) => (b.bannedAt || 0) - (a.bannedAt || 0));
    setSuspendedUsers(banned);

    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = reports.filter(r => {
    if (tab === "pending") return r.status === "pending";
    if (tab === "reviewed") return r.status === "reviewed" || r.status === "dismissed" || r.status === "warn" || r.status === "reinstated";
    if (tab === "blocked") return r.status === "blocked" || r.status === "suspended";
    return false;
  });

  const counts = {
    pending: reports.filter(r => r.status === "pending").length,
    reviewed: reports.filter(r => ["reviewed","dismissed","warn","reinstated"].includes(r.status)).length,
    blocked: reports.filter(r => r.status === "blocked" || r.status === "suspended").length,
    suspended: suspendedUsers.length,
  };

  const takeAction = async (action, note) => {
    if (!selected) return;
    const auditEntry = {
      action,
      by: session.userId,
      byHandle: session.user.handle,
      at: now(),
      note: note || null,
    };
    const updated = {
      ...selected,
      status: action,
      reviewedBy: session.userId,
      reviewedAt: now(),
      auditLog: [...(selected.auditLog || []), auditEntry],
    };
    await updateReport(selected.id, {
      status: action,
      reviewedBy: session.userId,
      reviewedAt: now(),
      auditLog: updated.auditLog,
    });

    if (action === "warn") {
      const u = await getUser(selected.reportedUser);
      if (u) await updateUser(selected.reportedUser, { warnings: (u.warnings||0)+1 });
    }
    if (action === "suspended" || action === "blocked") {
      await updateUser(selected.reportedUser, { banned: true, bannedAt: now(), bannedReason: selected.reason });
      // also end any active chats
      const chat = await getChat(selected.chatId);
      if (chat && !chat.endedBy) {
        await updateChat(selected.chatId, { endedBy: "moderator", endedAt: now() });
      }
    }
    showToast(`Report marked ${action}`, "success");
    // keep the report selected so moderator sees the audit update inline
    setSelected(updated);
    refresh();
  };

  // Reinstate a banned/suspended user. Can be invoked from a report (passes report)
  // or from the suspended-users tab (passes a userId directly).
  const reinstateUser = async (userId, sourceReport, note) => {
    const u = await getUser(userId);
    if (!u) { showToast("User not found", "error"); return; }
    await updateUser(userId, { banned: false, reinstatedAt: now(), bannedReason: null });

    // Find every report against this user that ended in suspended/blocked and append a reinstate audit entry
    const userReports = await listReportsForUser(userId);
    for (const r of userReports) {
      if (r.status === "suspended" || r.status === "blocked") {
        const auditEntry = {
          action: "reinstated",
          by: session.userId,
          byHandle: session.user.handle,
          at: now(),
          note: note || null,
          previousStatus: r.status,
        };
        await updateReport(r.id, {
          status: "reinstated",
          auditLog: [...(r.auditLog || []), auditEntry],
        });
      }
    }
    showToast(`${u.handle} reinstated`, "success");
    if (sourceReport) {
      const fresh = await getReport(sourceReport.id);
      setSelected(fresh);
    }
    refresh();
  };

  return (
    <div className="pb-12">
      <div className="px-5 py-4" style={{ background: "#1a1a18", color: "white" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-300" />
            <div>
              <div className="font-display text-xl">Moderator dashboard</div>
              <div className="text-[11px] text-stone-400">Limited access · enforcement only</div>
            </div>
          </div>
          <button onClick={onLogout} className="text-stone-400 hover:text-white"><LogOut size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 px-5 py-4 bg-stone-50">
        <Stat label="Pending" value={counts.pending} color="#a14545" />
        <Stat label="Reviewed" value={counts.reviewed} color="#5e7551" />
        <Stat label="Enforced" value={counts.blocked} color="#8b5e34" />
        <Stat label="Suspended" value={counts.suspended} color="#7f1d1d" />
      </div>

      <div className="flex border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        {[
          ["pending","Pending"],
          ["reviewed","Reviewed"],
          ["blocked","Enforced"],
          ["users","Users"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setSelected(null); }} className={`flex-1 py-3 text-xs font-medium transition border-b-2 ${tab === k ? "border-stone-900" : "border-transparent text-stone-400"}`}>{label}</button>
        ))}
      </div>

      {tab === "users" ? (
        <SuspendedUsersList
          users={suspendedUsers}
          loading={loading}
          onReinstate={(uid, note) => reinstateUser(uid, null, note)}
        />
      ) : !selected ? (
        <div className="px-5 py-4">
          {loading && <div className="text-stone-400 text-sm py-8 text-center">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-stone-400">
              <Inbox size={28} className="mx-auto mb-2 opacity-50" />
              <div className="text-sm">No reports here</div>
            </div>
          )}
          {filtered.map(r => (
            <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left p-4 mb-2 rounded-xl bg-white hover:bg-stone-50" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <SeverityDot s={r.severity} />
                  <div className="text-sm font-medium capitalize">{r.reason.replace(/_/g," ")}</div>
                </div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">{r.status}</div>
              </div>
              <div className="text-xs text-stone-500 line-clamp-2 italic">"{r.excerpt}"</div>
              <div className="text-[10px] text-stone-400 mt-2">User #{r.reportedUser.slice(0,8)} · reported {new Date(r.at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      ) : (
        <ReportDetail report={selected} onBack={() => setSelected(null)} onAction={takeAction} onReinstate={(note) => reinstateUser(selected.reportedUser, selected, note)} />
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-xl p-3 bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
      <div className="text-[10px] uppercase tracking-wider text-stone-400">{label}</div>
      <div className="font-display text-2xl mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function SeverityDot({ s }) {
  const colors = { high: "#a14545", medium: "#c4804a", low: "#7a8a6f" };
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors[s] }} />;
}

function ReportDetail({ report, onBack, onAction, onReinstate }) {
  const [chat, setChat] = useState(null);
  const [reportedUser, setReportedUser] = useState(null);
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [reinstateNote, setReinstateNote] = useState("");

  useEffect(() => {
    (async () => {
      setChat(await getChat(report.chatId));
      const u = await getUser(report.reportedUser);
      // Privacy: strip email when surfacing to moderator UI; keep only what mod needs
      if (u) setReportedUser({ id: u.id, handle: u.handle, createdAt: u.createdAt, banned: u.banned, warnings: u.warnings || 0 });
    })();
  }, [report.id, report.status]);

  const auditLog = report.auditLog || [];

  return (
    <div className="px-5 py-4">
      <button onClick={onBack} className="text-stone-500 text-sm mb-4 flex items-center gap-1">
        <ChevronRight size={14} className="rotate-180" /> Back to queue
      </button>

      <div className="rounded-2xl p-4 mb-3" style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><SeverityDot s={report.severity} /><div className="font-medium capitalize">{report.reason.replace(/_/g," ")}</div></div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400">{report.severity} severity</div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-stone-400 uppercase tracking-wider text-[10px]">Reported user</div>
            <div className="font-mono mt-0.5">#{report.reportedUser.slice(0,12)}</div>
            {reportedUser && (
              <div className="text-stone-500 mt-1">
                {reportedUser.handle} · {reportedUser.warnings} warnings
                {reportedUser.banned && <span className="text-red-700 font-medium"> · BANNED</span>}
              </div>
            )}
          </div>
          <div>
            <div className="text-stone-400 uppercase tracking-wider text-[10px]">Reported by</div>
            <div className="font-mono mt-0.5">{report.reportedBy === "system" ? "auto-detection" : `#${report.reportedBy.slice(0,12)}`}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-3" style={{ background: "#fffbeb", border: "0.5px solid #fde68a" }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#854d0e" }}>Excerpt</div>
        <div className="text-sm italic" style={{ color: "#713f12" }}>"{report.excerpt}"</div>
      </div>

      {chat && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-2">Conversation context</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {chat.messages.slice(-12).map(m => {
              const isReported = m.from === report.reportedUser;
              return (
                <div key={m.id} className={`text-xs p-2 rounded-lg ${isReported ? "bg-amber-50" : "bg-stone-50"}`}>
                  <div className="text-[10px] text-stone-400 mb-0.5">#{m.from.slice(0,8)} {isReported && <span className="text-amber-700 font-medium">(reported)</span>}</div>
                  <div>{m.text}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-stone-400">Shared traits at time of match: {report.sharedTraits?.join(", ") || "—"}</div>
        </div>
      )}

      {auditLog.length > 0 && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div className="flex items-center gap-1.5 mb-3">
            <History size={12} className="text-stone-500" />
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Audit trail</div>
          </div>
          <div className="space-y-2">
            {auditLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="mt-1 shrink-0">
                  <AuditDot action={entry.action} />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium capitalize">{entry.action.replace(/_/g," ")}</div>
                    <div className="text-[10px] text-stone-400">{new Date(entry.at).toLocaleString()}</div>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">by {entry.byHandle || `#${entry.by?.slice(0,8)}`}</div>
                  {entry.previousStatus && <div className="text-[11px] text-stone-500 mt-0.5">reversed: {entry.previousStatus}</div>}
                  {entry.note && <div className="text-[11px] text-stone-600 mt-1 italic">"{entry.note}"</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.status === "pending" && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => onAction("dismissed")} className="py-3 rounded-xl text-sm font-medium" style={{ background: "#f0ede5" }}>Dismiss</button>
          <button onClick={() => onAction("reviewed")} className="py-3 rounded-xl text-sm font-medium" style={{ background: "#e8f2f0", color: "#2d4a42" }}>Mark reviewed</button>
          <button onClick={() => onAction("warn")} className="py-3 rounded-xl text-sm font-medium" style={{ background: "#fef3c7", color: "#854d0e" }}>Warn user</button>
          <button onClick={() => onAction("suspended")} className="py-3 rounded-xl text-sm font-medium" style={{ background: "#fee2e2", color: "#991b1b" }}>Suspend</button>
          <button onClick={() => onAction("blocked")} className="col-span-2 py-3 rounded-xl text-sm font-medium text-white" style={{ background: "#7f1d1d" }}>Block account permanently</button>
        </div>
      )}

      {report.status !== "pending" && (
        <div className="mt-4 space-y-2">
          <div className="p-3 rounded-xl text-center text-sm" style={{ background: "#f0ede5", color: "#5a5a55" }}>
            Already actioned: <span className="font-medium capitalize">{report.status}</span>
          </div>

          {/* Reinstate flow only available when user is currently banned */}
          {reportedUser?.banned && (
            <>
              {!reinstateOpen ? (
                <button
                  onClick={() => setReinstateOpen(true)}
                  className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: "#e8f2f0", color: "#2d4a42", border: "0.5px solid #4a7c6f" }}
                >
                  <RotateCcw size={14} /> Reinstate user
                </button>
              ) : (
                <div className="rounded-xl p-3" style={{ background: "#f0fdf4", border: "0.5px solid #86efac" }}>
                  <div className="text-xs font-medium mb-2" style={{ color: "#166534" }}>Reinstate {reportedUser.handle}?</div>
                  <div className="text-[11px] mb-2" style={{ color: "#166534", opacity: 0.8 }}>This unbans the account and adds an entry to the audit trail. A reason is required.</div>
                  <textarea
                    value={reinstateNote}
                    onChange={e => setReinstateNote(e.target.value)}
                    placeholder="Reason for reinstatement (e.g. appeal granted, false positive)"
                    rows={2}
                    className="w-full text-xs p-2 rounded-lg outline-none resize-none"
                    style={{ border: "0.5px solid #86efac", background: "white" }}
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => { setReinstateOpen(false); setReinstateNote(""); }}
                      className="py-2 rounded-lg text-xs font-medium"
                      style={{ background: "white", border: "0.5px solid #86efac", color: "#166534" }}
                    >Cancel</button>
                    <button
                      onClick={() => {
                        if (!reinstateNote.trim()) return;
                        onReinstate(reinstateNote.trim());
                        setReinstateOpen(false);
                        setReinstateNote("");
                      }}
                      disabled={!reinstateNote.trim()}
                      className="py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                      style={{ background: "#166534" }}
                    >Confirm reinstate</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AuditDot({ action }) {
  const map = {
    dismissed: "#a8a29e",
    reviewed: "#5e7551",
    warn: "#c4804a",
    suspended: "#a14545",
    blocked: "#7f1d1d",
    reinstated: "#166534",
  };
  return <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: map[action] || "#a8a29e" }} />;
}

function SuspendedUsersList({ users, loading, onReinstate }) {
  const [confirmId, setConfirmId] = useState(null);
  const [note, setNote] = useState("");

  if (loading) return <div className="px-5 py-12 text-stone-400 text-sm text-center">Loading…</div>;
  if (users.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-stone-400">
        <UserX size={28} className="mx-auto mb-2 opacity-50" />
        <div className="text-sm">No suspended users</div>
        <div className="text-[11px] mt-1">When you suspend or block accounts, they appear here.</div>
      </div>
    );
  }
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] text-stone-500 mb-3 leading-relaxed">
        Accounts currently suspended or blocked. Reinstating undoes the ban and is recorded on every related report.
      </div>
      {users.map(u => (
        <div key={u.id} className="rounded-xl bg-white mb-2 overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display text-base">{u.handle}</div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5">#{u.id.slice(0,12)}</div>
              </div>
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "#fee2e2", color: "#991b1b" }}>
                {u.lastReport?.status || "banned"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px] text-stone-500 mt-2">
              <div><span className="text-stone-400">Warnings:</span> {u.warnings}</div>
              <div><span className="text-stone-400">Banned:</span> {u.bannedAt ? new Date(u.bannedAt).toLocaleDateString() : "—"}</div>
            </div>
            {u.bannedReason && (
              <div className="text-[11px] text-stone-500 mt-1">
                <span className="text-stone-400">Reason:</span> <span className="capitalize">{u.bannedReason.replace(/_/g," ")}</span>
              </div>
            )}
          </div>

          {confirmId !== u.id ? (
            <button
              onClick={() => { setConfirmId(u.id); setNote(""); }}
              className="w-full py-2.5 text-xs font-medium flex items-center justify-center gap-1.5"
              style={{ background: "#f0fdf4", color: "#166534", borderTop: "0.5px solid #86efac" }}
            >
              <RotateCcw size={12} /> Reinstate
            </button>
          ) : (
            <div className="p-3" style={{ background: "#f0fdf4", borderTop: "0.5px solid #86efac" }}>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Reason for reinstatement"
                rows={2}
                className="w-full text-xs p-2 rounded-lg outline-none resize-none"
                style={{ border: "0.5px solid #86efac", background: "white" }}
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => setConfirmId(null)} className="py-2 rounded-lg text-xs font-medium" style={{ background: "white", border: "0.5px solid #86efac", color: "#166534" }}>Cancel</button>
                <button
                  onClick={() => {
                    if (!note.trim()) return;
                    onReinstate(u.id, note.trim());
                    setConfirmId(null);
                    setNote("");
                  }}
                  disabled={!note.trim()}
                  className="py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: "#166534" }}
                >Confirm</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// SETTINGS SCREEN
// ============================================================
function SettingsScreen({ session, setScreen, settings, updateSettings, setSession, showToast, resolvedTheme, onLogout }) {
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [savedChatCount, setSavedChatCount] = useState(0);
  const [activeChatCount, setActiveChatCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState(session.user.handle);

  const loadBlocked = async () => {
    const blockedIds = await getBlocks(session.userId);
    const users = [];
    for (const bid of blockedIds) {
      const u = await getUser(bid);
      if (u) users.push({ id: u.id, handle: u.handle });
      else users.push({ id: bid, handle: "Unknown user" });
    }
    setBlockedUsers(users);
  };

  const loadCounts = async () => {
    const myChats = await listChatsFor(session.userId);
    let saved = 0, active = 0;
    for (const c of myChats) {
      if (c.savedBy?.includes(session.userId)) saved++;
      if (!c.endedBy) active++;
    }
    setSavedChatCount(saved);
    setActiveChatCount(active);
  };

  useEffect(() => { loadBlocked(); loadCounts(); }, [session.userId]);

  const unblock = async (uid) => {
    await removeBlock(session.userId, uid);
    showToast("User unblocked", "success");
    loadBlocked();
  };

  const regenerateHandle = async () => {
    const newH = genHandle();
    await updateUser(session.userId, { handle: newH });
    const updated = { ...session.user, handle: newH };
    setSession(prev => ({ ...prev, user: updated }));
    setNewHandle(newH);
    showToast(`New handle: ${newH}`, "success");
  };

  const saveCustomHandle = async () => {
    const trimmed = newHandle.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      showToast("Handle must be 3-30 characters", "error"); return;
    }
    await updateUser(session.userId, { handle: trimmed });
    const updated = { ...session.user, handle: trimmed };
    setSession(prev => ({ ...prev, user: updated }));
    setEditingHandle(false);
    showToast("Handle updated", "success");
  };

  const clearAllChats = async () => {
    const removed = await deleteAllChatsFor(session.userId);
    showToast(`Cleared ${removed} conversation${removed === 1 ? "" : "s"}`, "success");
    setConfirmClear(false);
    loadCounts();
  };

  const deleteAccount = async () => {
    // Wipe everything for this user
    await wipeUser(session.userId);
    // Clear local session
    try { localStorage.removeItem("commonality.session"); } catch {}
    showToast("Account deleted", "success");
    setTimeout(() => onLogout(), 500);
  };

  return (
    <div className="pb-12">
      <Header title="Settings" subtitle={`Signed in as ${session.user.handle}`} onBack={() => setScreen("home")} />

      <div className="px-6 space-y-5">
        {/* APPEARANCE */}
        <Section icon={<Sun size={14} />} title="Appearance">
          <SettingRow label="Theme" hint={settings.theme === "system" ? `Following system · currently ${resolvedTheme}` : null}>
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <ThemeButton active={settings.theme === "light"} onClick={() => updateSettings({ theme: "light" })} icon={<Sun size={14} />} label="Light" />
              <ThemeButton active={settings.theme === "dark"} onClick={() => updateSettings({ theme: "dark" })} icon={<Moon size={14} />} label="Dark" />
              <ThemeButton active={settings.theme === "system"} onClick={() => updateSettings({ theme: "system" })} icon={<Monitor size={14} />} label="System" />
            </div>
          </SettingRow>
        </Section>

        {/* PRIVACY & MATCHING */}
        <Section icon={<Eye size={14} />} title="Privacy & matching">
          <ToggleRow
            label="Pause matching"
            hint="You won't appear in others' match queues."
            checked={settings.privacy.pauseMatching}
            onChange={v => updateSettings({ privacy: { ...settings.privacy, pauseMatching: v } })}
          />
          <ToggleRow
            label="Require both-ready confirmation"
            hint="Difference reveal only unlocks when both users tap Ready (overrides timer/message thresholds)."
            checked={settings.privacy.requireBothReady}
            onChange={v => updateSettings({ privacy: { ...settings.privacy, requireBothReady: v } })}
          />
          <ToggleRow
            label="Hide trait tags in chat header"
            hint="Cleaner UI, but you'll need to remember what you have in common."
            checked={settings.privacy.hideTraitTags}
            onChange={v => updateSettings({ privacy: { ...settings.privacy, hideTraitTags: v } })}
          />
        </Section>

        {/* BLOCKED USERS */}
        <Section icon={<Ban size={14} />} title="Blocked users" badge={blockedUsers.length || null}>
          {blockedUsers.length === 0 ? (
            <div className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>You haven't blocked anyone. Blocks are private — the other person isn't notified.</div>
          ) : (
            <div className="space-y-1.5">
              {blockedUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "var(--bg-elev)" }}>
                  <div>
                    <div className="text-sm">{u.handle}</div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>#{u.id.slice(0,8)}</div>
                  </div>
                  <button onClick={() => unblock(u.id)} className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: "var(--sage-bg)", color: "var(--sage)" }}>
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* SAFETY */}
        <Section icon={<Shield size={14} />} title="Safety">
          <SettingRow label="Personal info detection" hint="What happens when phone numbers, emails, URLs, or handles are detected in your messages.">
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <SegButton active={settings.safety.piiSensitivity === "strict"} onClick={() => updateSettings({ safety: { ...settings.safety, piiSensitivity: "strict" } })} label="Strict" subLabel="Block" />
              <SegButton active={settings.safety.piiSensitivity === "standard"} onClick={() => updateSettings({ safety: { ...settings.safety, piiSensitivity: "standard" } })} label="Standard" subLabel="Mask" />
              <SegButton active={settings.safety.piiSensitivity === "lenient"} onClick={() => updateSettings({ safety: { ...settings.safety, piiSensitivity: "lenient" } })} label="Lenient" subLabel="Warn" />
            </div>
          </SettingRow>
        </Section>

        {/* CONVERSATIONS */}
        <Section icon={<MessageCircle size={14} />} title="Conversations" badge={activeChatCount > 0 ? `${activeChatCount} active` : null}>
          <ToggleRow
            label="Confirm before leaving"
            hint="Ask before ending a conversation."
            checked={settings.conversations.confirmBeforeLeave}
            onChange={v => updateSettings({ conversations: { ...settings.conversations, confirmBeforeLeave: v } })}
          />
          <ToggleRow
            label="Auto-save when leaving"
            hint="Save conversations to history automatically when you leave."
            checked={settings.conversations.autoSaveOnLeave}
            onChange={v => updateSettings({ conversations: { ...settings.conversations, autoSaveOnLeave: v } })}
          />
          <SettingRow label={`Clear all conversations`} hint={`Permanently removes all ${savedChatCount + activeChatCount} of your conversations.`}>
            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)} className="text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap" style={{ background: "var(--rose-soft)", color: "var(--rose-text)" }}>
                Clear all
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1.5 rounded-full" style={{ background: "var(--bg-soft)", color: "var(--text-secondary)" }}>Cancel</button>
                <button onClick={clearAllChats} className="text-xs px-3 py-1.5 rounded-full font-medium text-white" style={{ background: "#7f1d1d" }}>Confirm</button>
              </div>
            )}
          </SettingRow>
        </Section>

        {/* NOTIFICATIONS */}
        <Section icon={<Bell size={14} />} title="Notifications">
          <ToggleRow
            label="New matches"
            hint="When someone new shares enough with you to chat."
            checked={settings.notifications.newMatches}
            onChange={v => updateSettings({ notifications: { ...settings.notifications, newMatches: v } })}
          />
          <ToggleRow
            label="New messages"
            hint="When you receive a message in an active conversation."
            checked={settings.notifications.newMessages}
            onChange={v => updateSettings({ notifications: { ...settings.notifications, newMessages: v } })}
          />
          <ToggleRow
            label="Moderator actions"
            hint="When a report you filed is reviewed, or when an action is taken on your account."
            checked={settings.notifications.modActions}
            onChange={v => updateSettings({ notifications: { ...settings.notifications, modActions: v } })}
          />
        </Section>

        {/* ACCOUNT */}
        <Section icon={<UserCircle size={14} />} title="Account">
          <SettingRow label="Anonymous handle" hint="Other users see this name. Change it any time.">
            {!editingHandle ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setEditingHandle(true)} className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: "var(--bg-soft)", color: "var(--text-primary)" }}>Edit</button>
                <button onClick={regenerateHandle} title="Regenerate" className="p-1.5 rounded-full" style={{ background: "var(--bg-soft)", color: "var(--text-secondary)" }}><RefreshCw size={12} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  value={newHandle}
                  onChange={e => setNewHandle(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                  style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-input)" }}
                />
                <button onClick={() => { setEditingHandle(false); setNewHandle(session.user.handle); }} className="text-xs px-2 py-1.5 rounded-full" style={{ background: "var(--bg-soft)" }}>
                  <X size={12} />
                </button>
                <button onClick={saveCustomHandle} className="text-xs px-2 py-1.5 rounded-full" style={{ background: "var(--sage)", color: "white" }}>
                  <Check size={12} />
                </button>
              </div>
            )}
          </SettingRow>
          <InfoRow label="Account created" value={new Date(session.user.createdAt).toLocaleDateString()} />
          <SettingRow label="Delete account" hint="Permanently removes your profile, conversations, and data. This cannot be undone.">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: "var(--rose-soft)", color: "var(--rose-text)" }}>
                Delete
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-full" style={{ background: "var(--bg-soft)", color: "var(--text-secondary)" }}>Cancel</button>
                <button onClick={deleteAccount} className="text-xs px-3 py-1.5 rounded-full font-medium text-white" style={{ background: "#7f1d1d" }}>Delete forever</button>
              </div>
            )}
          </SettingRow>
        </Section>

        {/* ABOUT */}
        <Section icon={<FileText size={14} />} title="About">
          <InfoRow label="Version" value="0.1.0 (prototype)" />
          <div className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Commonality matches people through what they share, then surfaces one difference at a time. Conversations are anonymous to other users. Reports are reviewed by moderators who see only what's needed for enforcement — never your email or full profile.
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, badge, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "0.5px solid var(--border-soft)" }}>
        <div style={{ color: "var(--sage-mid)" }}>{icon}</div>
        <div className="text-sm font-medium flex-1">{title}</div>
        {badge && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-elev)", color: "var(--text-secondary)" }}>{badge}</span>}
      </div>
      <div className="p-4 space-y-3.5">{children}</div>
    </div>
  );
}

function SettingRow({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm">{label}</div>
          {hint && <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{hint}</div>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{hint}</div>}
      </div>
      <div className="text-xs shrink-0 truncate max-w-[60%]" style={{ color: "var(--text-secondary)" }}>{value}</div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <SettingRow
      label={label}
      hint={hint}
    >
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className="relative shrink-0 transition"
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          background: checked ? "var(--sage)" : "var(--border-strong)",
        }}
      >
        <span
          className="absolute top-0.5 transition-all"
          style={{
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </button>
    </SettingRow>
  );
}

function ThemeButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] transition"
      style={{
        background: active ? "var(--sage-bg)" : "var(--bg-elev)",
        border: active ? "0.5px solid var(--sage-mid)" : "0.5px solid transparent",
        color: active ? "var(--sage)" : "var(--text-secondary)",
        fontWeight: active ? 500 : 400,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function SegButton({ active, onClick, label, subLabel }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center py-2 rounded-lg text-[11px] transition"
      style={{
        background: active ? "var(--sage-bg)" : "var(--bg-elev)",
        border: active ? "0.5px solid var(--sage-mid)" : "0.5px solid transparent",
        color: active ? "var(--sage)" : "var(--text-secondary)",
        fontWeight: active ? 500 : 400,
      }}
    >
      <div>{label}</div>
      {subLabel && <div className="text-[9px] opacity-70">{subLabel}</div>}
    </button>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <div className="px-6 pt-6 pb-4 flex items-start justify-between">
      <div>
        <button onClick={onBack} className="text-stone-400 text-sm mb-2 flex items-center gap-1 hover:text-stone-600">
          <ChevronRight size={14} className="rotate-180" /> Back
        </button>
        <div className="font-display text-2xl">{title}</div>
        {subtitle && <div className="text-xs text-stone-500 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
