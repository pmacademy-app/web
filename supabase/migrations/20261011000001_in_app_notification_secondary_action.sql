-- Growth R5 / B0 — a second action on an in-app notification.
--
-- in_app_notifications has one deep link (action_url). Achievement notifications also need a
-- share action (share the portfolio, add a certificate to LinkedIn), which this nullable jsonb
-- column carries: { "kind": ..., "label": ... } plus kind-specific fields. The app validates the
-- shape on read (lib/notifications/in-app/secondary-action.ts) and ignores anything it does not
-- recognise, so a malformed value can never render.
--
-- Additive and nullable: no default rewrite of existing rows, no backfill, safe to apply live.

ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS secondary_action jsonb;

COMMENT ON COLUMN public.in_app_notifications.secondary_action IS
'Optional second action (e.g. share) for the notification; validated by the app on read. NULL = none.';
