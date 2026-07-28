-- PM Academy — Waitlist Table Migration
-- Migration: 20260728000001_create_waitlist.sql

SET search_path TO public, extensions, auth;

-- ─── 1. Table Setup ──────────────────────────────────────────────────────────
create table if not exists waitlist (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text unique not null,
  "career_position" text not null,
  source       text not null default 'direct',
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  referrer     text,
  created_at   timestamptz not null default now()
);

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────
-- Email index for fast duplicate check
create index if not exists waitlist_email_idx on waitlist (email);

-- Created_at index for sorting submissions in the dashboard
create index if not exists waitlist_created_at_idx on waitlist (created_at desc);

-- ─── 3. Row Level Security (RLS) ──────────────────────────────────────────────
alter table waitlist enable row level security;

-- Permit insert operations for anonymous visitors & authenticated users
create policy "Anyone can join waitlist"
  on waitlist
  for insert
  to anon, authenticated
  with check (true);

-- Explicitly deny public reads (no select policy represents implicit deny; this acts as a belt-and-suspenders safety net)
create policy "No public read on waitlist"
  on waitlist
  for select
  to anon
  using (false);
