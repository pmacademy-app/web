-- PM Academy — Sprint 4 Waitlist Table
-- Run this migration in your Supabase project: SQL Editor → New Query

-- ─── Table ───────────────────────────────────────────────────────────────────

create table if not exists waitlist (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  email        text        unique not null,
  current_role text        not null,
  source       text        not null default 'direct',
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  referrer     text,
  created_at   timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Email index for fast duplicate checking
create index if not exists waitlist_email_idx on waitlist (email);

-- Created_at index for dashboard sorting
create index if not exists waitlist_created_at_idx on waitlist (created_at desc);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Insert-only for anon. No select policy = no public read access.
-- Read the waitlist via Supabase dashboard (service role) only.

alter table waitlist enable row level security;

create policy "Anyone can join waitlist"
  on waitlist
  for insert
  to anon, authenticated
  with check (true);

-- Explicitly deny public reads (belt-and-suspenders alongside the absent select policy)
create policy "No public read on waitlist"
  on waitlist
  for select
  to anon
  using (false);
