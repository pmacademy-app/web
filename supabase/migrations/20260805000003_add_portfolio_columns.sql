-- PM Academy — Public Portfolio Columns Migration
-- Migration: 20260805000003_add_portfolio_columns.sql
-- Adds portfolio fields (username, bio, avatar_url, social links, public toggle) to users table

SET search_path TO public, extensions, auth;

alter table users
  add column if not exists username text unique,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists website_url text,
  add column if not exists is_portfolio_public boolean not null default true;

-- Index on username for fast public portfolio lookups
create index if not exists users_username_idx on users (username);

-- Public RLS Policy: Allow anyone (unauthenticated & authenticated) to view public user profiles
create policy "Public can view public profiles" on users
  for select
  using (is_portfolio_public = true);
