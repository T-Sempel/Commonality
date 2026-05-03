# Commonality — Hackathon Setup

Get from zero → live multi-user app in about **10 minutes**. Everything below is on free tiers.

---

## What changed

- **Login**: one screen. Pick a handle → tap Enter. No email, no OTP, no TOS. Session persists in `localStorage`.
- **Backend**: Supabase (Postgres + realtime websockets) replaces the in-browser `window.storage`. Two users on different devices can now actually chat.
- **Realtime**: messages stream over Supabase channels — no more polling.
- **Demo bots**: 4 seeded "demo" users (Curious River, Steady Compass, Quiet Lantern, Bright Field) auto-reply so a solo presenter always has someone to talk to. Real human users do **not** auto-reply.
- **Moderator**: still works. Code is `MOD2024`, accessible via the small "Moderator access" link on the login screen.

---

## Files in this drop

| File | What it is |
|------|-----------|
| `commonality.jsx` | The React app. Drop into your Vite/Next/CRA project. |
| `supabase.js` | The data layer. Paste your Supabase URL + anon key at the top. |
| `schema.sql` | One-shot SQL: tables, indexes, realtime publications, demo users. |
| `SETUP.md` | This file. |

---

## Step 1 — Create a Supabase project (~2 min)

1. Go to **https://supabase.com**, sign up (free), click **New project**.
2. Pick any name and a strong DB password (you won't need it again).
3. Choose the region closest to your demo location.
4. Wait ~1 minute for provisioning.

## Step 2 — Run the schema (~30 sec)

1. In the project, open **SQL Editor** (left sidebar).
2. Click **New query**, paste the **entire contents** of `schema.sql`, click **Run**.
3. You should see `Success. No rows returned`. The 4 demo users + moderator are now seeded.

## Step 3 — Wire up the keys (~30 sec)

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **`anon` public key**.
3. Open `supabase.js` and replace these two lines near the top:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";
   ```
   The anon key is **meant to be public** — it's safe in client code. (For production you'd add Row-Level Security; for the hackathon it's intentionally off so the demo "just works".)

## Step 4 — Drop the files into your React app

Assuming a Vite + React project (run `npm create vite@latest` if you don't have one):

```bash
npm install @supabase/supabase-js lucide-react
```

Place files at the same level so `commonality.jsx` can `import "./supabase"`:

```
src/
├── commonality.jsx
├── supabase.js
└── main.jsx        (or App.jsx — whatever renders <CommonalityApp />)
```

In your `main.jsx` / `App.jsx`:

```jsx
import CommonalityApp from "./commonality";
export default function App() { return <CommonalityApp />; }
```

Tailwind is used inline. If your project doesn't already have Tailwind, `npm install -D tailwindcss postcss autoprefixer` and run `npx tailwindcss init -p`, or just throw the Tailwind play CDN into your `index.html` for the hackathon: `<script src="https://cdn.tailwindcss.com"></script>`.

## Step 5 — Run it

```bash
npm run dev
```

Open in two browsers (or one normal + one incognito). Pick different handles. Tap **Find a connection** in both. They'll match → tap **Start chat** → real-time chat works.

---

## Step 6 — Deploy (optional, ~3 min)

Easiest free option: **Vercel**.

```bash
npm i -g vercel
vercel
```

Answer the prompts (link to a new project, accept defaults). You'll get a URL in ~30 seconds. Share it. It works on phones.

GitHub → Vercel integration also works if you'd rather push and let it build.

---

## Resetting between demos

To wipe everyone's chats/messages but keep demo users + moderator, run this in **Supabase → SQL Editor**:

```sql
truncate messages, chats, matches, reports, blocks restart identity cascade;
delete from users where role = 'user';
delete from profiles where user_id not in (select id from users);
delete from settings where user_id not in (select id from users);
```

To nuke everything and re-seed from scratch: re-run `schema.sql` (it's idempotent for table creation) and then `truncate` the data tables.

---

## What's intentionally not production-ready

These are fine for a 5-minute hackathon demo and **not** fine for real users:

- **No Row-Level Security.** Anyone with the anon key can read any row. For real, enable RLS on every table and write policies tied to `auth.uid()`.
- **No real auth.** Handle-only "login" is trivially impersonatable. For real, swap to Supabase Auth (email-magic-link is one click in their dashboard) and join `users.id` to `auth.users.id`.
- **Moderator code in client code.** `MOD2024` lives in the bundle. For real, move moderator gating server-side.
- **No content moderation pipeline.** The harassment-detector is a tiny regex list.

If a judge asks "what would you change for prod?" — that list above is the answer.

---

## Troubleshooting

- **"Could not sign in — check your Supabase setup"** on the login screen → URL or anon key in `supabase.js` is wrong, or the schema didn't run.
- **Messages don't appear in real-time** → Supabase realtime publications failed to add. Re-run the `alter publication supabase_realtime add table ...` lines from `schema.sql` manually.
- **CORS errors** → make sure you're using the `https://...supabase.co` URL exactly, no trailing slash.
- **"Match" works but "Start chat" doesn't load** → the other user probably hasn't accepted yet. The 4 seeded demo users always auto-accept; pair with one of them first to confirm the pipe works.

Demo handles to look for in the matches list: **Curious River**, **Steady Compass**, **Quiet Lantern**, **Bright Field**.
