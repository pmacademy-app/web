-- Migration: 20260813000002_service_role_comments.sql
-- Documents service-role only tables by design.

SET search_path TO public, extensions, auth;

COMMENT ON TABLE email_dead_letter IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE email_delivery_events IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE email_suppressions IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE notification_feature_flags IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE notification_template_versions IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE notification_templates IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE rate_limits IS 'service-role only by design — no policies intentional';
COMMENT ON TABLE system_settings IS 'service-role only by design — no policies intentional';
