-- PM Academy — Leaderboard, Friends & Cohort Migration
-- Migration: 20260805000006_create_leaderboards_and_cohorts.sql

SET search_path TO public, extensions, auth;

-- 1. Leaderboard Privacy Settings
create table if not exists user_leaderboard_settings (
  user_id uuid primary key references users(id) on delete cascade,
  is_opted_in boolean not null default true,
  allow_friend_requests boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2. Weekly Leaderboard Snapshots
create table if not exists weekly_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  user_id uuid references users(id) on delete cascade not null,
  days_studied int not null default 0,
  lessons_completed int not null default 0,
  xp_earned int not null default 0,
  rank int not null default 0,
  created_at timestamptz not null default now(),
  unique (week_start, user_id)
);

-- 3. User Friends System
create table if not exists user_friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  friend_id uuid references users(id) on delete cascade not null,
  status text not null default 'accepted', -- 'pending' | 'accepted'
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

-- 4. Cohorts
create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  is_private boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. Cohort Members
create table if not exists cohort_members (
  cohort_id uuid references cohorts(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

-- RLS Policies
alter table user_leaderboard_settings enable row level security;
alter table weekly_leaderboard_snapshots enable row level security;
alter table user_friends enable row level security;
alter table cohorts enable row level security;
alter table cohort_members enable row level security;

-- Policies for settings
create policy "Users can view own leaderboard settings"
  on user_leaderboard_settings for select
  using (auth.uid() = user_id);

create policy "Users can manage own leaderboard settings"
  on user_leaderboard_settings for all
  using (auth.uid() = user_id);

-- Policies for public weekly snapshots (opted-in only)
create policy "Anyone can view weekly snapshots"
  on weekly_leaderboard_snapshots for select
  using (true);

-- Policies for friends
create policy "Users can view their friends"
  on user_friends for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can add friends"
  on user_friends for insert
  with check (auth.uid() = user_id);

create policy "Users can remove friends"
  on user_friends for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Policies for cohorts
create policy "Anyone can view public cohorts"
  on cohorts for select
  using (true);

create policy "Users can view cohort members"
  on cohort_members for select
  using (true);

create policy "Users can join cohorts"
  on cohort_members for insert
  with check (auth.uid() = user_id);

create policy "Users can leave cohorts"
  on cohort_members for delete
  using (auth.uid() = user_id);

-- Seed default public cohorts
insert into cohorts (slug, name, description) values
  ('foundations-2026', 'PM Foundations Cohort', 'Learners mastering product strategy and discovery fundamentals.'),
  ('career-switchers', 'Career Switchers', 'Aspiring PMs switching from engineering, design, data, and consulting.')
on conflict (slug) do nothing;
