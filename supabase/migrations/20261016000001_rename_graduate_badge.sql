-- Migration: 20261016000001_rename_graduate_badge.sql
-- Brand cleanup: the product is "Prodily", not "PM Academy".
-- The badge key stays 'pm_academy_graduate' (awarded badges reference it); only the
-- display name and description change. The description also drops "and 9 capstones":
-- the badge is awarded on lessons completed alone (lib/badges/badges.ts), so the old
-- wording claimed a requirement that is never checked.

update badges
set
  name = 'Prodily Graduate',
  description = 'Completed all 90 curriculum lessons'
where key = 'pm_academy_graduate';
