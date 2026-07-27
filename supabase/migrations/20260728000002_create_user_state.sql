-- PM Academy — User State Schema Migration
-- Migration: 20260728000002_create_user_state.sql
-- Implements complete user-state data model per Architecture.md §2 with security enhancements

SET search_path TO public, extensions, auth;

-- ─── 1. Users Table ──────────────────────────────────────────────────────────
create table if not exists users (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text unique not null,
  name                     text,
  auth_provider            text not null default 'email', -- 'email' | 'google'
  timezone                 text not null default 'UTC',   -- captured at signup, used for streak day-boundary calc
  goal                     text,                          -- 'job_search' | 'fill_gaps' | 'exploring'
  current_streak           int not null default 0,
  longest_streak           int not null default 0,
  streak_freezes_available int not null default 0,
  total_xp                 int not null default 0,        -- denormalized cache, source of truth is xp_events
  level                    int not null default 1,
  created_at               timestamptz not null default now()
);

create index if not exists users_email_idx on users (email);

-- ─── 2. User Lesson Progress ─────────────────────────────────────────────────
create table if not exists user_lesson_progress (
  user_id        uuid references users(id) on delete cascade,
  lesson_slug    text not null,                 -- matches slug in static JSON
  status         text not null default 'not_started', -- 'not_started' | 'in_progress' | 'completed'
  theory_read_at timestamptz,
  quiz_score     int,
  quiz_attempts  int not null default 0,
  xp_earned      int not null default 0,
  completed_at   timestamptz,
  primary key (user_id, lesson_slug)
);

create index if not exists user_lesson_progress_user_idx on user_lesson_progress (user_id);

-- ─── 3. Quiz Attempts ────────────────────────────────────────────────────────
create table if not exists quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  lesson_slug     text not null,
  question_id     text not null,                -- stable ID from static JSON
  selected_option int not null,
  is_correct      boolean not null,
  attempted_at    timestamptz not null default now()
);

create index if not exists quiz_attempts_user_lesson_idx on quiz_attempts (user_id, lesson_slug);

-- ─── 4. User Flashcard Spaced Repetition (SRS) ────────────────────────────────
create table if not exists user_flashcard_srs (
  user_id        uuid references users(id) on delete cascade,
  flashcard_id   text not null,                 -- stable ID from static JSON
  ease_factor    numeric not null default 2.5,  -- SM-2 state
  interval_days  int not null default 0,
  repetitions    int not null default 0,
  next_review_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

create index if not exists user_flashcard_srs_user_review_idx on user_flashcard_srs (user_id, next_review_at);

-- ─── 5. XP Events Ledger (Source of Truth) ───────────────────────────────────
create table if not exists xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  source_type text not null,                   -- 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak'
  source_id   text,                            -- nullable ref to lesson slug or content ID
  xp_amount   int not null,
  created_at  timestamptz not null default now()
);

create index if not exists xp_events_user_idx on xp_events (user_id);

-- Trigger function: Update user total_xp and level whenever an xp_event is inserted
create or replace function update_user_xp_and_level()
returns trigger as $$
declare
  new_total int;
  calculated_level int;
begin
  select coalesce(sum(xp_amount), 0) into new_total
  from xp_events
  where user_id = NEW.user_id;

  -- Level title logic: 500 XP per level increments (capped at level 9)
  calculated_level := least(9, greatest(1, floor(new_total / 500) + 1));

  update users
  set total_xp = new_total,
      level = calculated_level
  where id = NEW.user_id;

  return NEW;
end;
$$ language plpgsql;

create or replace trigger trigger_update_user_xp
after insert on xp_events
for each row
execute function update_user_xp_and_level();

-- Anti-tampering Trigger: Recalculate and enforce authentic total_xp and level on user updates
create or replace function sync_user_xp_and_level_on_update()
returns trigger as $$
declare
  actual_xp int;
  calculated_level int;
begin
  -- Recalculate from the ledger to prevent direct table updates by the client
  select coalesce(sum(xp_amount), 0) into actual_xp
  from xp_events
  where user_id = NEW.id;

  calculated_level := least(9, greatest(1, floor(actual_xp / 500) + 1));

  NEW.total_xp := actual_xp;
  NEW.level := calculated_level;

  return NEW;
end;
$$ language plpgsql;

create or replace trigger trigger_sync_user_xp_on_update
before update on users
for each row
execute function sync_user_xp_and_level_on_update();

-- ─── 6. Reflections ──────────────────────────────────────────────────────────
create table if not exists reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  lesson_slug text not null,
  content     text not null,
  is_public   boolean not null default false,  -- visible on public portfolio export
  created_at  timestamptz not null default now()
);

create index if not exists reflections_user_lesson_idx on reflections (user_id, lesson_slug);

-- ─── 7. Bookmarks ─────────────────────────────────────────────────────────────
create table if not exists bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  lesson_slug text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, lesson_slug)
);

-- ─── 8. Capstone Submissions ─────────────────────────────────────────────────
create table if not exists capstone_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete cascade,
  module_slug  text not null,
  content      text not null,
  status       text not null default 'submitted', -- 'submitted' | 'reviewed'
  is_public    boolean not null default false,     -- visible on portfolio export
  submitted_at timestamptz not null default now()
);

create index if not exists capstone_submissions_user_idx on capstone_submissions (user_id);

-- ─── 9. Badges & User Badges ──────────────────────────────────────────────────
create table if not exists badges (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text not null,
  icon        text not null
);

create table if not exists user_badges (
  user_id   uuid references users(id) on delete cascade,
  badge_id  uuid references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- Seed initial 10 core badges
insert into badges (key, name, description, icon) values
  ('first_quiz', 'First Quiz Completed', 'Completed your first PM lesson quiz.', 'CheckCircle'),
  ('perfect_quiz', 'Flawless Score', 'Achieved a 100% first-attempt score on a lesson quiz.', 'Zap'),
  ('first_capstone', 'First Capstone', 'Submitted your first applied module capstone.', 'Award'),
  ('module_1_complete', 'Foundations Master', 'Completed all lessons in Module 1.', 'BookOpen'),
  ('module_2_complete', 'Discovery Expert', 'Completed all lessons in Module 2.', 'Search'),
  ('module_3_complete', 'PRD Author', 'Completed all lessons in Module 3.', 'FileText'),
  ('streak_7', 'Week-long Scholar', 'Maintained a 7-day learning streak.', 'Flame'),
  ('streak_30', 'Habit Unlocked', 'Maintained a 30-day learning streak.', 'Trophy'),
  ('comeback', 'Resilient Learner', 'Resumed learning after a break of 2+ weeks.', 'RefreshCw'),
  ('cpo_completion', 'Chief Product Officer', 'Completed all 90 lessons and 9 capstones.', 'Crown')
on conflict (key) do nothing;

-- ─── 10. Cohorts & Leaderboard ────────────────────────────────────────────────
create table if not exists cohorts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists cohort_members (
  cohort_id uuid references cohorts(id) on delete cascade,
  user_id   uuid references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

-- ─── 11. Row Level Security (RLS) Policies ───────────────────────────────────
alter table users enable row level security;
alter table user_lesson_progress enable row level security;
alter table quiz_attempts enable row level security;
alter table user_flashcard_srs enable row level security;
alter table xp_events enable row level security;
alter table reflections enable row level security;
alter table bookmarks enable row level security;
alter table capstone_submissions enable row level security;
alter table user_badges enable row level security;
alter table cohort_members enable row level security;

-- Users RLS
create policy "Users can view own profile" on users for select using (auth.uid() = id);
create policy "Users can insert own profile" on users for insert with check (auth.uid() = id);
create policy "Users can update own profile" on users for update using (auth.uid() = id);

-- User Lesson Progress RLS (SELECT only for client - mutations verified server-side)
create policy "Users view own progress" on user_lesson_progress for select using (auth.uid() = user_id);

-- Quiz Attempts RLS (SELECT only for client - mutations verified server-side)
create policy "Users view own quiz attempts" on quiz_attempts for select using (auth.uid() = user_id);

-- Flashcard SRS RLS (Full access since SRS calculations run on client via SM-2)
create policy "Users manage own flashcard srs" on user_flashcard_srs for all using (auth.uid() = user_id);

-- XP Events RLS (SELECT only for client - XP events ledger populated server-side only)
create policy "Users view own xp events" on xp_events for select using (auth.uid() = user_id);

-- Reflections RLS (Allow public read if is_public = true for portfolio export)
create policy "Users manage own reflections" on reflections for all using (auth.uid() = user_id);
create policy "Public can view public reflections" on reflections for select using (is_public = true);

-- Bookmarks RLS (Full client access for bookmark management)
create policy "Users manage own bookmarks" on bookmarks for all using (auth.uid() = user_id);

-- Capstone Submissions RLS (Allow public read if is_public = true for portfolio export)
create policy "Users manage own capstones" on capstone_submissions for all using (auth.uid() = user_id);
create policy "Public can view public capstones" on capstone_submissions for select using (is_public = true);

-- User Badges RLS (SELECT only for client - badges awarded server-side only)
create policy "Users view own badges" on user_badges for select using (auth.uid() = user_id);

-- Cohort Members RLS (SELECT only for client - group membership managed server-side)
create policy "Cohort members view cohort" on cohort_members for select using (auth.uid() = user_id);
