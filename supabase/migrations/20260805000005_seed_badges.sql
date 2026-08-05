-- PM Academy — Seed Standard Badges Definition Migration
-- Migration: 20260805000005_seed_badges.sql
-- Pre-populates standard badge definitions into badges table

SET search_path TO public, extensions, auth;

insert into badges (key, name, description, icon) values
  ('first_lesson', 'First Step', 'Completed your very first PM lesson', 'BookOpen'),
  ('module_complete', 'Module Master', 'Completed all 10 lessons in a single module', 'CheckCircle2'),
  ('curriculum_explorer', 'Curriculum Explorer', 'Completed at least 30 lessons across modules', 'Compass'),
  ('first_perfect_quiz', 'Sharpshooter', 'Scored 100% on a quiz on your first attempt', 'Target'),
  ('quiz_master', 'Quiz Master', 'Scored 100% on 10 different lesson quizzes', 'Sparkles'),
  ('first_level_up', 'Level Up!', 'Reached Level 2 (Junior PM)', 'ShieldCheck'),
  ('xp_1000', '1,000 XP Club', 'Earned 1,000 total experience points', 'Zap'),
  ('xp_5000', '5,000 XP Veteran', 'Earned 5,000 total experience points', 'Trophy'),
  ('streak_7', '7-Day Streak', 'Maintained a 7-day active study streak', 'Flame'),
  ('streak_30', '30-Day Habit', 'Maintained a 30-day active study streak', 'Flame'),
  ('streak_comeback', 'Comeback Kid', 'Recovered a broken streak using a streak freeze', 'RotateCw'),
  ('first_capstone', 'Artifact Builder', 'Submitted your first applied capstone deliverable', 'Award'),
  ('capstones_all', 'Capstone Titan', 'Submitted all 9 module capstone deliverables', 'Crown'),
  ('portfolio_published', 'Public Craftsman', 'Published your public portfolio for peers & recruiters', 'Globe'),
  ('pm_academy_graduate', 'PM Academy Graduate', 'Completed all 90 curriculum lessons and 9 capstones', 'GraduationCap')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon;
