# Commonality — Architecture Map

A flat list of every file with a one-line description and notes on where
**Vercel** and **Supabase** plug in.

```
commonality/
│
├── README.md                      Project overview + structure
├── package.json                   Workspaces root (frontend, backend, shared)
├── vercel.json                    🟢 VERCEL: build command, function runtime, env binding
├── .env.example                   🟣 SUPABASE: SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
│
├── shared/                        Code used by both frontend and backend
│   ├── package.json
│   ├── types.ts                   User, Profile, Chat, Report, Settings, ApiResult<T>
│   ├── constants.ts               PROFILE_FIELDS, BANNED_PHRASES, PII_PATTERNS,
│   │                              REVEAL_RULES, TOS_VERSION, handle word lists
│   └── validation.ts              detectViolations(), maskPII(), isValidEmail/Handle
│
├── backend/                       Vercel serverless functions
│   ├── README.md                  Route list + privilege model explanation
│   ├── package.json               @supabase/supabase-js, resend, zod
│   ├── tsconfig.json
│   ├── db/
│   │   └── schema.sql             🟣 SUPABASE: tables + RLS policies + Realtime publication
│   ├── lib/
│   │   ├── supabase.ts            🟣 SUPABASE: supabaseAdmin (service role) +
│   │   │                                       supabaseUserClient(req) (RLS-enforced)
│   │   ├── privacy.ts             getPublicView(), getModeratorView() — strip PII
│   │   ├── email.ts               🟣 SUPABASE Auth handles OTP email by default;
│   │   │                          Resend wrapper here is for non-auth notices
│   │   │                          (account deletion, suspension, reinstatement)
│   │   ├── rateLimit.ts           In-memory token bucket; swap for Upstash in prod
│   │   └── http.ts                CORS + ApiResult<T> response helpers
│   └── api/                       🟢 VERCEL: each .ts file becomes a serverless function
│       ├── auth/
│       │   ├── send-otp.ts        🟣 supabase.auth.signInWithOtp() — SUPABASE sends the email
│       │   ├── verify-otp.ts      🟣 supabase.auth.verifyOtp() — issues session cookies
│       │   ├── mod-login.ts       Gates moderator dashboard; magic-link session
│       │   └── logout.ts          Clears cookies + revokes Supabase session
│       ├── me.ts                  GET/PATCH/DELETE — own account, cascades on delete
│       ├── profile.ts             GET/PUT — read & save own profile
│       ├── settings.ts            GET/PUT — theme, privacy, safety, notifications
│       ├── matches/
│       │   ├── index.ts           List candidates (privacy-stripped via getPublicView)
│       │   └── [id]/accept.ts     Accept a match → opens a chat
│       ├── chats/
│       │   ├── index.ts           List user's chats with message counts
│       │   └── [id]/
│       │       ├── index.ts       Get full chat with messages
│       │       ├── messages.ts    Send (server-side PII + harassment + rate limit)
│       │       ├── ready.ts       Both-sides "ready to reveal" short-circuit
│       │       ├── leave.ts       End conversation
│       │       └── save.ts        Add to user's saved history
│       ├── blocks/
│       │   ├── index.ts           GET list / POST add (also ends active chats)
│       │   └── [userId].ts        DELETE — unblock
│       ├── reports.ts             POST — file a report
│       └── mod/
│           ├── reports.ts         🛡 GET list / PATCH action — moderator-only
│           └── users/
│               ├── suspended.ts   🛡 List suspended users (banned == true)
│               └── [id]/reinstate.ts 🛡 Reverse suspension; appends audit entries
│
└── frontend/                      Vite + React app
    ├── README.md                  Auth flow explanation, "why API not direct Supabase"
    ├── package.json               react, lucide-react, @supabase/supabase-js (anon only)
    ├── tsconfig.json
    ├── vite.config.ts             🟢 VERCEL: dev proxy /api → vercel dev :3001
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx               Entry point
        ├── App.tsx                Top-level routing, theme injection
        ├── index.css              Tailwind directives, font setup
        ├── lib/
        │   ├── api.ts             🔑 Typed fetch() wrapper for /api/* — replaces window.storage
        │   ├── supabase.ts        🟣 Browser client (anon key only) — for realtime + auth state
        │   └── theme.ts           Light/dark CSS variable definitions
        ├── hooks/
        │   ├── useSession.ts      Subscribes to supabase.auth state changes
        │   ├── useSettings.ts     Loads/saves settings, manages theme resolution
        │   └── useChat.ts         🟣 Postgres CDC subscription via supabase.channel()
        │                          REPLACES the prototype's setInterval(2500)
        ├── components/
        │   ├── AgreeRow.tsx       TOS agreement checkbox card
        │   └── TosBlock.tsx       TOS section heading + body
        └── screens/
            ├── PORTING.md         Map from prototype → new screens
            ├── AuthScreen.tsx     ✅ Fully ported. 5 sub-flows: landing, login,
            │                       signup, tos, otp, mod
            ├── HomeScreen.tsx     ✅ Fully ported.
            ├── ProfileScreen.tsx       — STUB, port from prototype
            ├── MatchesScreen.tsx       — STUB
            ├── ChatScreen.tsx          — STUB (use useChat hook)
            ├── SavedChatsScreen.tsx    — STUB
            ├── SettingsScreen.tsx      — STUB
            └── ModeratorDashboard.tsx  — STUB
```

## How emails actually get sent

**`POST /api/auth/send-otp`** calls `supabase.auth.signInWithOtp({ email })`.

Supabase Auth then:
1. Generates a 6-digit code
2. Stores it server-side with TTL
3. Sends the email — using Supabase's own transactional infrastructure by
   default, OR using your custom SMTP if you've configured it in the
   Supabase dashboard (Auth → Providers → Email → Custom SMTP)
4. Tracks attempts and rate-limits internally (we add app-level limits on top)

**You never write OTP-generation, OTP-storage, or OTP-verification logic
yourself.** That's the entire point of using Supabase Auth.

For non-auth emails (account deletion, suspension notices, reinstatement),
`backend/lib/email.ts` wraps Resend. Set `RESEND_API_KEY` and `EMAIL_FROM`
in your env to enable.

## How Vercel deploys this

```
$ vercel
```

Vercel detects:
- `vercel.json` at the root → uses its config
- `frontend/` with `npm run build` → static site at `frontend/dist`
- `backend/api/**/*.ts` → each becomes a serverless function at `/api/<path>`

The `rewrites` in `vercel.json` send `/api/*` to functions and everything
else to the SPA's `index.html`.

In dev:
```bash
npm install
cp .env.example .env.local       # fill in Supabase keys
npm run dev                       # runs vite (5173) + vercel dev (3001) concurrently
```

Vite's proxy forwards `/api/*` from :5173 to :3001 so the frontend can call
the backend as if they were on one origin.

## Privacy boundaries — defense in depth

When a user fetches `/api/matches`, this is what happens:
1. **Cookie** carries the `sb-access-token` JWT
2. **Vercel function** receives the request and calls `getAuthedAppUser(req)`
3. **Supabase RLS** ensures the user can only read their own profile/settings
4. To read OTHER users' profiles, the function uses `supabaseAdmin` — but
   immediately runs every record through `getPublicView()` before responding
5. The frontend never sees email, role, or ban metadata for any other user

If a malicious user calls the raw API with a forged request, RLS still
blocks them. If a frontend bug ever logged the response, only public
fields would leak. If the privacy stripper has a bug, RLS catches it.
Each layer covers the others.
