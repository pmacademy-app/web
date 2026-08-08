-- PM Academy — Certificate System 2.0 Template Versioning Migration
-- Migration: 20260808000001_add_certificate_template_version.sql
-- Adds template_version column to certificates table, defaulting existing rows to 1.

SET search_path TO public, extensions, auth;

alter table certificates add column if not exists template_version int not null default 1;
