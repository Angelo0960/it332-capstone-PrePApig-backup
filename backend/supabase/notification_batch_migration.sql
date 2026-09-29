-- Notification Batch Scoping Migration
-- Run this in Supabase SQL Editor (safe to re-run).
--
-- Adds notifications.batch_id so the same reminder can be tracked per batch.
-- Without it, the daily cron can only dedupe on (user, type), which meant a
-- user with two batches needing a feed change was told about the first and
-- silently never told about the second.

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES pig_batches(id) ON DELETE CASCADE;

COMMENT ON COLUMN notifications.batch_id IS 'Batch this notification refers to; NULL for general/user-wide notifications';

-- Supports the "already sent this today for this batch?" lookup
CREATE INDEX IF NOT EXISTS idx_notifications_batch_dedupe
    ON notifications(user_id, type, batch_id, created_at DESC)
    WHERE is_read IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO anon, authenticated;
