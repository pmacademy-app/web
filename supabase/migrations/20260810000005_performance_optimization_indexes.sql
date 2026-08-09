-- Performance Optimization Indexes Migration
-- Adds composite indexes for frequently filtered and sorted operational tables

CREATE INDEX IF NOT EXISTS idx_testimonials_published_status
  ON public.testimonials (is_published, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
  ON public.contact_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
  ON public.admin_audit_logs (created_at DESC);
