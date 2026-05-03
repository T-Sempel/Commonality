# Commonality Backend

Vercel serverless API + Supabase database. Each file in `api/` becomes a route.

## Routes

```
POST   /api/auth/send-otp        → Supabase Auth signInWithOtp
POST   /api/auth/verify-otp      → Supabase Auth verifyOtp + create app user
POST   /api/auth/mod-login       → Verify mod code, mint session
DELETE /api/auth/logout          → Sign out

GET    /api/me                   → Current user record (own data only)
PATCH  /api/me                   → Update handle / settings
DELETE /api/me                   → Delete account + cascade

GET    /api/profile              → Read own profile
PUT    /api/profile              → Save profile (with field-level opt-ins)

GET    /api/matches              → List candidates based on shared traits
POST   /api/matches/:id/accept   → Accept a match → opens chat

GET    /api/chats                → List user's chats
GET    /api/chats/:id            → Read chat (participants only)
POST   /api/chats/:id/messages   → Send a message
POST   /api/chats/:id/leave      → End conversation
POST   /api/chats/:id/save       → Save to history
POST   /api/chats/:id/ready      → Confirm "ready to reveal"

POST   /api/blocks               → Block a user
DELETE /api/blocks/:userId       → Unblock

POST   /api/reports              → File a report

# Moderator-only (gated by role check)
GET    /api/mod/reports          → List reports with filters
PATCH  /api/mod/reports/:id      → Take action on a report
GET    /api/mod/users/suspended  → List suspended users
POST   /api/mod/users/:id/reinstate → Reinstate user
```

## Local development

```bash
cd backend
npm install
cp ../.env.example .env.local
# Fill in Supabase values
npm run dev   # uses vercel dev to emulate the serverless runtime
```

## Privilege model

Two clients to Supabase:

- **`supabaseUserClient(req)`** — uses the user's JWT (forwarded from cookie). Subject to Row Level Security. This is what the app uses 99% of the time.
- **`supabaseAdmin`** — uses `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS. Used only for: user creation during signup, moderator dashboard reads, account deletion cascade, and report status updates.

Never expose the service role client to user code paths. Never return service-role-fetched user records to other users without first running `getPublicView()`.
