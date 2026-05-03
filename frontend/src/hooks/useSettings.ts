// =============================================================================
// useSettings — load + save user settings, manage theme
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { settings as settingsApi } from "../lib/api";
import { resolveTheme } from "../lib/theme";
import type { UserSettings } from "@commonality/shared/types";

const DEFAULTS: UserSettings = {
  theme: "light",
  notifications: { newMatches: true, newMessages: true, modActions: true },
  privacy: { pauseMatching: false, requireBothReady: false, hideTraitTags: false },
  safety: { piiSensitivity: "standard" },
  conversations: { autoSaveOnLeave: false, confirmBeforeLeave: true },
};

export function useSettings(enabled: boolean) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // Load on mount / when enabled
  useEffect(() => {
    if (!enabled) return;
    settingsApi.get().then(setSettings).catch(() => setSettings(DEFAULTS));
  }, [enabled]);

  // Keep resolvedTheme in sync with settings.theme + system preference
  useEffect(() => {
    const update = () => setResolvedTheme(resolveTheme(settings.theme));
    update();
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", update);
      return () => mq.removeEventListener?.("change", update);
    }
  }, [settings.theme]);

  const update = useCallback(async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (enabled) {
      await settingsApi.save(next).catch((e) => console.error("Save settings failed:", e));
    }
  }, [settings, enabled]);

  return { settings, update, resolvedTheme };
}
