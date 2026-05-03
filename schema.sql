-- =============================================================
-- Commonality — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run; it uses IF NOT EXISTS / DROP-and-recreate where needed.
-- =============================================================

-- ----- USERS -----
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  handle          text not null,
  created_at      timestamptz not null default now(),
  banned          boolean not null default false,
  banned_at       timestamptz,
  banned_reason   text,
  reinstated_at   timestamptz,
  warnings        int not null default 0,
  role            text not null default 'user'      -- 'user' | 'moderator' | 'demo'
);
create index if not exists users_role_idx on users(role);
create index if not exists users_banned_idx on users(banned);

-- ----- PROFILES (1:1 with users; jsonb keeps the shape flexible) -----
create table if not exists profiles (
  user_id     uuid primary key references users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ----- SETTINGS (1:1 with users) -----
create table if not exists settings (
  user_id  uuid primary key references users(id) on delete cascade,
  data     jsonb not null default '{}'::jsonb
);

-- ----- BLOCKS (many-to-many) -----
create table if not exists blocks (
  blocker     uuid references users(id) on delete cascade,
  blocked     uuid references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);

-- ----- MATCHES -----
create table if not exists matches (
  id            text primary key,
  user_a        uuid references users(id) on delete cascade,
  user_b        uuid references users(id) on delete cascade,
  shared        jsonb not null default '[]'::jsonb,
  future_cat    jsonb,
  proposed_at   timestamptz not null default now(),
  a_agreed      boolean not null default false,
  b_agreed      boolean not null default false,
  both_agreed   boolean not null default false
);

-- ----- CHATS -----
create table if not exists chats (
  id                text primary key,
  match_id          text,
  participants      uuid[] not null,
  handles           jsonb not null default '{}'::jsonb,
  shared            jsonb not null default '[]'::jsonb,
  reveal_key        text,
  reveal_label      text,
  reveal_values     jsonb,
  unlocked          boolean not null default false,
  unlocked_at       timestamptz,
  ready_confirmed   jsonb not null default '{}'::jsonb,
  ended_by          uuid,
  ended_at          timestamptz,
  saved_by          uuid[] not null default '{}'::uuid[],
  created_at        timestamptz not null default now()
);
create index if not exists chats_participants_idx on chats using gin (participants);

-- ----- MESSAGES (separate table → enables realtime INSERT subscriptions) -----
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     text not null references chats(id) on delete cascade,
  from_user   uuid not null references users(id) on delete cascade,
  text        text not null,
  warning     text,
  at          timestamptz not null default now()
);
create index if not exists messages_chat_id_at_idx on messages(chat_id, at);

-- ----- REPORTS -----
create table if not exists reports (
  id              text primary key,
  chat_id         text,
  reported_user   uuid,
  reported_by     text,                              -- user uuid or 'system'
  reason          text,
  severity        text,
  excerpt         text,
  shared_traits   jsonb default '[]'::jsonb,
  at              timestamptz not null default now(),
  status          text not null default 'pending',  -- pending|reviewed|dismissed|warn|suspended|blocked|reinstated
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  audit_log       jsonb not null default '[]'::jsonb
);
create index if not exists reports_status_idx on reports(status);
create index if not exists reports_reported_user_idx on reports(reported_user);

-- =============================================================
-- REALTIME — enable for the tables we subscribe to
-- =============================================================
do $$ begin
  alter publication supabase_realtime add table chats;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table matches;
exception when duplicate_object then null; end $$;

-- =============================================================
-- ROW LEVEL SECURITY — disabled for hackathon simplicity.
-- The anon key can read/write everything. This is fine for a
-- demo. For production, enable RLS and write policies.
-- =============================================================
alter table users     disable row level security;
alter table profiles  disable row level security;
alter table settings  disable row level security;
alter table blocks    disable row level security;
alter table matches   disable row level security;
alter table chats     disable row level security;
alter table messages  disable row level security;
alter table reports   disable row level security;

-- =============================================================
-- DEMO USERS — seeded so a solo presenter has people to match with.
-- These are flagged role='demo'. The app simulates replies from them
-- so you can show the chat flow even with no other real users online.
-- Delete them later if you want a clean slate.
-- =============================================================
insert into users (id, handle, role, created_at) values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Curious River',  'demo', now() - interval '1 day'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Steady Compass', 'demo', now() - interval '1 day'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Quiet Lantern',  'demo', now() - interval '1 day'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Bright Field',   'demo', now() - interval '1 day')
on conflict (id) do nothing;

insert into profiles (user_id, data) values
  ('11111111-1111-1111-1111-111111111111'::uuid, '{
     "ageRange": {"value":"25-34","optInMatch":true},
     "tvLike":   {"value":"Comedy/sitcoms","optInMatch":true,"optInReveal":true},
     "hobby":    {"value":"Reading","optInMatch":true,"optInReveal":true},
     "politics": {"value":"Liberal","optInMatch":false,"optInReveal":true},
     "food":     {"value":"Italian","optInMatch":true}
   }'::jsonb),
  ('22222222-2222-2222-2222-222222222222'::uuid, '{
     "ageRange": {"value":"35-44","optInMatch":true},
     "tvLike":   {"value":"Comedy/sitcoms","optInMatch":true},
     "hobby":    {"value":"Cooking","optInMatch":true,"optInReveal":true},
     "politics": {"value":"Conservative","optInMatch":false,"optInReveal":true},
     "region":   {"value":"Rural","optInMatch":true,"optInReveal":true}
   }'::jsonb),
  ('33333333-3333-3333-3333-333333333333'::uuid, '{
     "hobby":    {"value":"Reading","optInMatch":true,"optInReveal":true},
     "food":     {"value":"Asian","optInMatch":true},
     "religion": {"value":"Buddhist","optInMatch":false,"optInReveal":true},
     "pets":     {"value":"Cat person","optInMatch":true,"optInReveal":true}
   }'::jsonb),
  ('44444444-4444-4444-4444-444444444444'::uuid, '{
     "tvLike":    {"value":"Sci-fi/fantasy","optInMatch":true},
     "hobby":     {"value":"Gaming","optInMatch":true,"optInReveal":true},
     "education": {"value":"Master''s","optInMatch":true,"optInReveal":true},
     "politics":  {"value":"Libertarian","optInMatch":false,"optInReveal":true}
   }'::jsonb)
on conflict (user_id) do nothing;

-- A built-in moderator account (used by the moderator login screen).
insert into users (id, handle, role, created_at) values
  ('99999999-9999-9999-9999-999999999999'::uuid, 'Moderator', 'moderator', now())
on conflict (id) do nothing;
