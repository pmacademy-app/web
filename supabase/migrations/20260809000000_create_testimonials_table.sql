-- Migration: 20260809000000_create_testimonials_table.sql
-- Description: Create testimonials table for Sprint 7.4 Feedback & Testimonials Moderation Pipeline

create table if not exists testimonials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade,
  source_event      text not null,          -- 'lesson_3' | 'module_complete' | 'certificate_complete' | 'general'
  content           text not null,
  status            text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  is_published       boolean not null default false,   -- separate from 'approved' (can hold publishing for marketing launches)
  reviewed_by        uuid references users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

-- Enable RLS
alter table testimonials enable row level security;

-- Policy 1: Authenticated users can insert their own testimonials
create policy "Users can submit feedback"
  on testimonials for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- Policy 2: Authenticated users can select their own submissions
create policy "Users can view own feedback"
  on testimonials for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy 3: Public read access for published testimonials (for Marketing site Sprint 8.1)
create policy "Public can read published testimonials"
  on testimonials for select
  to public
  using (is_published = true);
