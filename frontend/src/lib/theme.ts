// =============================================================================
// THEME TOKENS
// =============================================================================
// Lifted out of App.tsx. The CSS variables get injected by ThemeProvider.
// =============================================================================

export const themeCss = `
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
}
`;

export type ThemeMode = "light" | "dark" | "system";

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}
