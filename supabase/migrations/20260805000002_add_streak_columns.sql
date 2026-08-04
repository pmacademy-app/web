-- PM Academy — Streak Engine Enhancement Migration
-- Migration: 20260805000002_add_streak_columns.sql
-- Adds last_streak_date to users for timezone-aware, deterministic streak tracking

SET search_path TO public, extensions, auth;

alter table users
  add column if not exists last_streak_date text;

comment on column users.last_streak_date is 'ISO date string (YYYY-MM-DD) of the last qualifying study day in the user''s local timezone.';
