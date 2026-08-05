-- PM Academy — Certificate & Verification System Migration
-- Migration: 20260805000004_create_certificates.sql
-- Creates certificates table storing immutable completion credentials and verification codes

SET search_path TO public, extensions, auth;

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  certificate_code text unique not null,
  type text not null default 'full_curriculum', -- 'full_curriculum' | 'module_completion'
  module_slug text,
  learner_name text not null,
  level int not null default 1,
  career_title text not null,
  total_xp int not null default 0,
  lessons_completed int not null default 0,
  modules_completed int not null default 0,
  issued_at timestamptz not null default now()
);

-- Index on certificate_code for fast public verification lookups
create index if not exists certificates_code_idx on certificates (certificate_code);
create index if not exists certificates_user_idx on certificates (user_id);

-- Enable RLS
alter table certificates enable row level security;

-- Public RLS Policy: Allow anyone (unauthenticated & authenticated) to view certificate verification records
create policy "Public can view certificates" on certificates
  for select
  using (true);

-- User RLS Policy: Users can insert certificate records for themselves
create policy "Users can insert own certificates" on certificates
  for insert
  with check (auth.uid() = user_id);
