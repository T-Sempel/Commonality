// =============================================================================
// HomeScreen — see _PORTING.md for the porting pattern from the prototype
// =============================================================================
// Production version differs from the prototype only in its data-loading layer:
//   - profile data comes from /api/profile
//   - active chat list comes from /api/chats
//   - settings come from /api/settings (via useSettings hook)
// The visual layout, theming, and copy are unchanged.
// =============================================================================

import { useEffect, useState } from "react";
import { Settings, LogOut, Users, MessageCircle, ChevronRight, Sparkles, Pause } from "lucide-react";
import { profile as profileApi, chats as chatsApi } from "../lib/api";
import { PROFILE_FIELDS } from "@commonality/shared/constants";
import type { Session } from "../hooks/useSession";
import type { UserSettings } from "@commonality/shared/types";

interface Props {
  session: Session;
  setScreen: (s: any) => void;
  onLogout: () => void;
  settings: UserSettings;
}

export default function HomeScreen({ session, setScreen, onLogout, settings }: Props) {
  const [filledFields, setFilledFields] = useState(0);
  const [activeChatCount, setActiveChatCount] = useState(0);

  useEffect(() => {
    profileApi.get().then((p) => {
      setFilledFields(Object.keys(p || {}).filter((k) => p[k]?.value).length);
    });
    chatsApi.list().then((list) => {
      setActiveChatCount(list.filter((c) => !c.endedBy).length);
    });
  }, []);

  const matchingPaused = settings.privacy.pauseMatching;

  return (
    <div className="px-6 pt-8 pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Signed in as</div>
          <div className="font-display text-2xl mt-0.5">{session.user.handle}</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Anonymous to others</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setScreen("settings")} className="p-2 hover:opacity-70" style={{ color: "var(--text-tertiary)" }}><Settings size={18} /></button>
          <button onClick={onLogout} className="p-2 hover:opacity-70" style={{ color: "var(--text-tertiary)" }}><LogOut size={18} /></button>
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-3" style={{ background: "linear-gradient(135deg, var(--sage), var(--sage-mid))" }}>
        <div className="text-xs uppercase tracking-wider opacity-80" style={{ color: "#e8f2f0" }}>Profile</div>
        <div className="font-display text-xl mt-1" style={{ color: "white" }}>{filledFields} of {PROFILE_FIELDS.length} fields</div>
        <button onClick={() => setScreen("profile")} className="mt-4 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
          {filledFields === 0 ? "Set up profile" : "Edit profile"} <ChevronRight size={14} />
        </button>
      </div>

      {matchingPaused && (
        <div className="rounded-xl p-3 mb-3 flex items-center gap-2" style={{ background: "var(--amber-bg)", border: "0.5px solid var(--amber-border)" }}>
          <Pause size={14} style={{ color: "var(--amber)" }} />
          <div className="text-xs flex-1" style={{ color: "var(--amber)" }}>Matching is paused.</div>
          <button onClick={() => setScreen("settings")} className="text-xs underline" style={{ color: "var(--amber)" }}>Resume</button>
        </div>
      )}

      <NavCard icon={<Users size={16} style={{ color: "var(--sage-mid)" }} />} title="Find a conversation"
        hint="Match anonymously by what you share" onClick={() => setScreen("matches")} disabled={matchingPaused} />
      <NavCard icon={<MessageCircle size={16} style={{ color: "var(--sage-mid)" }} />} title="Your conversations"
        badge={activeChatCount > 0 ? `${activeChatCount} active` : undefined}
        hint="Saved and ongoing chats" onClick={() => setScreen("savedChats")} />
      <NavCard icon={<Settings size={16} style={{ color: "var(--sage-mid)" }} />} title="Settings"
        hint="Theme, privacy, blocked users, and more" onClick={() => setScreen("settings")} />

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

function NavCard({ icon, title, hint, onClick, badge, disabled }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void; badge?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full mt-3 first:mt-0 rounded-2xl p-5 text-left disabled:opacity-50"
      style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <div className="font-medium">{title}</div>
            {badge && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--sage-bg)", color: "var(--sage)" }}>{badge}</span>}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{hint}</div>
        </div>
        <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
      </div>
    </button>
  );
}
