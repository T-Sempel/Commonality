# Commonality Frontend

React + Vite app. Deploys to Vercel as a static build with serverless API routes.

## Setup

```bash
cd frontend
npm install
cp ../.env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the public ones only!)
npm run dev
```

## Structure

```
src/
├── App.tsx              # Top-level routing + theme/session state
├── main.tsx             # Entry point
├── lib/
│   ├── api.ts           # Typed fetch client for /api/* endpoints
│   ├── supabase.ts      # Browser-side Supabase client (anon key only)
│   └── theme.ts         # Theme tokens + CSS variable injection
├── hooks/
│   ├── useSession.ts    # Subscribes to Supabase Auth state
│   ├── useSettings.ts   # Loads/saves user settings
│   └── useChat.ts       # Realtime subscription to a chat
├── screens/
│   ├── AuthScreen.tsx   # Landing / Login / Signup / TOS / OTP / Mod login
│   ├── HomeScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── MatchesScreen.tsx
│   ├── ChatScreen.tsx
│   ├── SavedChatsScreen.tsx
│   ├── SettingsScreen.tsx
│   └── ModeratorDashboard.tsx
└── components/
    ├── ToggleRow.tsx
    ├── Section.tsx
    ├── AgreeRow.tsx
    └── ...
```

## How the auth flow works now (vs the prototype)

**Prototype:** OTP code generated client-side in JS, stored in React state, displayed on screen for autofill.

**Production:** 
1. User submits email → frontend calls `POST /api/auth/send-otp`
2. Backend calls `supabase.auth.signInWithOtp({ email })`
3. Supabase Auth generates the code, stores it server-side, sends the email via its built-in transactional email infrastructure (or your custom SMTP)
4. User receives the code in their inbox
5. User enters the code → frontend calls `POST /api/auth/verify-otp`
6. Backend calls `supabase.auth.verifyOtp({ email, token })` which returns a session
7. Backend sets `sb-access-token` httpOnly cookie
8. Subsequent API calls include the cookie automatically

No OTP code ever lives in the browser, no auth secrets in client-side code.

## Why the API client and not direct Supabase calls?

You _can_ call Supabase directly from the browser using the anon key + RLS — that's a valid pattern. We chose to route through `/api/*` for these reasons:

1. **Server-authoritative validation.** PII detection and harassment filters need to run on the server before persisting; otherwise a user with devtools could bypass them.
2. **Privacy-stripping at the edge.** `getPublicView()` runs server-side before user data crosses to another user.
3. **Rate limiting.** Per-IP and per-user limits live in the API layer.
4. **Future flexibility.** If you ever swap Supabase for another DB, the frontend stays the same.

For pure-realtime subscriptions (live chat updates), the frontend does talk to Supabase directly — that's what `lib/supabase.ts` is for. RLS gates which channels it can read.
