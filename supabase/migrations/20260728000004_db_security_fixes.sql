-- PM Academy — Database Security Fixes
-- Migration: 20260728000004_db_security_fixes.sql

SET search_path TO public, extensions, auth;

-- ─── 1. Enable RLS on remaining tables ─────────────────────────────────────────
alter table badges enable row level security;
alter table cohorts enable row level security;

-- ─── 2. Create RLS Policies for Badges & Cohorts ────────────────────────────────
-- Allow read-only access to badges for everyone
create policy "Allow read access to badges for everyone" on badges
  for select to anon, authenticated using (true);

-- Allow read-only access to cohorts for authenticated users
create policy "Allow read access to cohorts for authenticated users" on cohorts
  for select to authenticated using (true);

-- ─── 3. Secure Trigger Functions with search_path and security definer ────────
-- Re-define update_user_xp_and_level with security definer and search_path = public
create or replace function update_user_xp_and_level()
returns trigger
security definer
set search_path = public
as $$
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

-- Re-define sync_user_xp_and_level_on_update with security definer and search_path = public
create or replace function sync_user_xp_and_level_on_update()
returns trigger
security definer
set search_path = public
as $$
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
