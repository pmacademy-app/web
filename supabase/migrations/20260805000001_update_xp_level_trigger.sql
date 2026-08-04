-- PM Academy — Update XP Level Trigger Migration
-- Migration: 20260805000001_update_xp_level_trigger.sql
-- Aligns DB trigger level calculation with PRD.md §4.6 and TS calculateLevel() thresholds

SET search_path TO public, extensions, auth;

-- Helper function to calculate level from total_xp using PRD level thresholds
create or replace function calculate_user_level(p_xp int)
returns int as $$
begin
  if p_xp >= 14000 then return 9;
  elsif p_xp >= 10000 then return 8;
  elsif p_xp >= 7000 then return 7;
  elsif p_xp >= 4500 then return 6;
  elsif p_xp >= 2750 then return 5;
  elsif p_xp >= 1500 then return 4;
  elsif p_xp >= 750 then return 3;
  elsif p_xp >= 250 then return 2;
  else return 1;
  end if;
end;
$$ language plpgsql immutable;

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

  calculated_level := calculate_user_level(new_total);

  update users
  set total_xp = new_total,
      level = calculated_level
  where id = NEW.user_id;

  return NEW;
end;
$$ language plpgsql;

-- Anti-tampering Trigger: Recalculate and enforce authentic total_xp and level on user updates
create or replace function sync_user_xp_and_level_on_update()
returns trigger as $$
declare
  actual_xp int;
  calculated_level int;
begin
  select coalesce(sum(xp_amount), 0) into actual_xp
  from xp_events
  where user_id = NEW.id;

  calculated_level := calculate_user_level(actual_xp);

  NEW.total_xp := actual_xp;
  NEW.level := calculated_level;

  return NEW;
end;
$$ language plpgsql;
