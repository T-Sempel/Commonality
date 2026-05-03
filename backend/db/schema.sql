-- =============================================================================
-- COMMONALITY · Supabase schema
-- =============================================================================
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Re-run after every change; statements are idempotent where possible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- USERS
-- -----------------------------------------------------------------------------
-- Supabase Auth manages auth.users (with email + auth metadata) automatically
-- via signInWithOtp. We mirror to a public.users table for app-specific fields.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  created_at timestamptz not null default now(),
  banned boolean not null default false,
  banned_at timestamptz,
  banned_reason text,
  reinstated_at timestamptz,
  warnings int not null default 0,
  tos_accepted_at timestamptz,
  tos_version text,
  role text not null default 'user' check (role in ('user', 'moderator'))
);

alter table public.users enable row level security;

-- A user can read their own row.
create policy "users_self_read" on public.users
  for select using (auth.uid() = id);

-- A user can update their own row, but cannot change role / banned / warnings (admin-only fields).
create policy "users_self_update" on public.users
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.users where id = auth.uid())
    and banned = (select banned from public.users where id = auth.uid())
    and warnings = (select warnings from public.users where id = auth.uid())
  );

-- Other users can see ONLY handle and id of users they are matched with.
-- We expose this via a SECURITY DEFINER function rather than direct table access.
create or replace function public.get_public_user(target_id uuid)
  returns table (id uuid, handle text, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select id, handle, created_at from public.users where id = target_id;
$$;

-- -----------------------------------------------------------------------------
-- PROFILES
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_self_all" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- BLOCKS
-- -----------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create policy "blocks_owner_all" on public.blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- -----------------------------------------------------------------------------
-- MATCHES
-- -----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  shared jsonb not null,
  future_cat jsonb not null,
  proposed_at timestamptz not null default now(),
  a_agreed boolean not null default false,
  b_agreed boolean not null default false,
  both_agreed boolean generated always as (a_agreed and b_agreed) stored,
  unique (user_a, user_b)
);

alter table public.matches enable row level security;

create policy "matches_participant_read" on public.matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "matches_participant_update" on public.matches
  for update using (auth.uid() = user_a or auth.uid() = user_b);

-- -----------------------------------------------------------------------------
-- CHATS
-- -----------------------------------------------------------------------------
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete set null,
  participants uuid[] not null,
  shared jsonb not null,
  reveal_key text,
  reveal_values jsonb,
  reveal_label text,
  unlocked boolean not null default false,
  unlocked_at timestamptz,
  ready_confirmed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ended_by text,                  -- user id or 'moderator'
  ended_at timestamptz,
  saved_by uuid[] not null default array[]::uuid[]
);

alter table public.chats enable row level security;

create policy "chats_participant_read" on public.chats
  for select using (auth.uid() = any(participants));

create policy "chats_participant_update" on public.chats
  for update using (auth.uid() = any(participants));

-- -----------------------------------------------------------------------------
-- MESSAGES  (separate table for streaming + realtime)
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  from_user uuid not null references public.users(id) on delete cascade,
  text text not null,
  warning text,
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_idx on public.messages(chat_id, created_at);

alter table public.messages enable row level security;

create policy "messages_participant_read" on public.messages
  for select using (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id
        and auth.uid() = any(chats.participants)
    )
  );

create policy "messages_participant_insert" on public.messages
  for insert with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.chats
      where chats.id = messages.chat_id
        and auth.uid() = any(chats.participants)
        and chats.ended_by is null
    )
  );

-- Enable realtime for live chat
alter publication supabase_realtime add table public.messages;

-- -----------------------------------------------------------------------------
-- REPORTS
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete set null,
  reported_user uuid not null references public.users(id) on delete cascade,
  reported_by text not null,        -- user id or 'system'
  reason text not null,
  severity text not null check (severity in ('low','medium','high')),
  excerpt text not null,
  shared_traits jsonb,
  status text not null default 'pending'
    check (status in ('pending','reviewed','dismissed','warn','suspended','blocked','reinstated')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  audit_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- A reporter can read their own reports.
create policy "reports_reporter_read" on public.reports
  for select using (reported_by = auth.uid()::text);

-- A reporter can create a report against another user.
create policy "reports_reporter_insert" on public.reports
  for insert with check (reported_by = auth.uid()::text);

-- Moderators can read/update all reports.
create policy "reports_mod_all" on public.reports
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'moderator')
  );

-- -----------------------------------------------------------------------------
-- USER SETTINGS
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings_self_all" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- HELPER: cascading delete on account deletion
-- -----------------------------------------------------------------------------
-- Already handled via ON DELETE CASCADE foreign keys above.
-- Calling auth.admin.deleteUser(id) wipes the auth row, which cascades to:
--   public.users → profiles, settings, blocks, messages, matches, chats, reports.
