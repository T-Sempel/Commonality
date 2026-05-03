# Commonality

An anonymous, text-only conversation app where people meet through what they share, then discuss one thing they don't.

## Project Structure

```
commonality/
├── frontend/          # React app (deploys to Vercel as static site or Next.js)
│   ├── src/
│   │   ├── screens/   # Top-level views (Auth, Home, Chat, Settings, etc.)
│   │   ├── components/# Reusable UI primitives
│   │   ├── lib/       # API client, Supabase client, helpers
│   │   └── hooks/     # Custom React hooks
│   └── package.json
│
├── backend/           # Vercel serverless functions + Supabase integration
│   ├── api/           # HTTP route handlers (one file per endpoint, Vercel convention)
│   ├── lib/           # Email sender, rate limiter, auth helpers
│   ├── db/            # Supabase schema + RLS policies + migrations
│   └── package.json
│
└── shared/            # Shared types, constants, validation schemas
    ├── types.ts
    ├── constants.ts
    └── validation.ts
```

## Where Vercel and Supabase fit

**Vercel** hosts both:
- The static frontend build (or Next.js app)
- The `/api/*` routes as serverless functions

**Supabase** provides:
- Postgres database for users, profiles, chats, reports, etc.
- Auth (email OTP via `signInWithOtp`) — replaces our custom OTP code
- Row Level Security (RLS) so users only see their own data at the DB layer
- Realtime subscriptions for live chat messages (replaces our 2.5s polling)
- Storage (not used in MVP, but available if we add file attachments later)

## Why this split matters

Privacy boundaries are now enforced at multiple layers:
1. **Frontend** masks PII before send and never displays cross-user emails
2. **API layer** validates session, strips fields with `getPublicView()` before responding
3. **Database** RLS policies prevent SELECT on rows the requesting user doesn't own
4. **Supabase Auth** is the only place that handles email — the app never touches it directly

A user could maliciously call the raw API; RLS still blocks them. A frontend bug could leak a field; API-layer stripping catches it. Defense in depth.

## Getting started

See `frontend/README.md` and `backend/README.md` for setup.

## Demo prototype

This codebase is structured for production deployment. The original single-file prototype (`commonality.jsx`) is preserved separately as a working in-browser demo using `window.storage` instead of Supabase.
