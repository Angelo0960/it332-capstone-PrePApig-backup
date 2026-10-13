BEGIN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farm_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farm_address TEXT;
-- A non-partial unique index lets PostgREST infer the reminder upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_full_idx ON notifications(user_id, dedupe_key);
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 feed_reminders BOOLEAN NOT NULL DEFAULT TRUE,
 vaccination_reminders BOOLEAN NOT NULL DEFAULT TRUE,
 push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mortality_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES profiles(id),
 batch_id UUID NOT NULL REFERENCES pig_batches(id) ON DELETE RESTRICT,
 death_date DATE NOT NULL,
 count INTEGER NOT NULL CHECK (count > 0),
 cause TEXT NOT NULL,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS treatment_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES profiles(id),
 batch_id UUID NOT NULL REFERENCES pig_batches(id) ON DELETE RESTRICT,
 treatment_date DATE NOT NULL,
 condition TEXT NOT NULL,
 treatment TEXT NOT NULL,
 medication TEXT,
 dosage TEXT,
 administered_by TEXT,
 outcome TEXT,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mortality_owner_date ON mortality_records(owner_id, death_date DESC);
CREATE INDEX IF NOT EXISTS treatment_owner_date ON treatment_records(owner_id, treatment_date DESC);
-- The batch lock serializes concurrent deaths. Existing historical counts are not inferred.
CREATE OR REPLACE FUNCTION apply_mortality_count() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE available INTEGER; batch_owner UUID;
BEGIN
 IF TG_OP = 'INSERT' THEN
  SELECT pig_count, owner_id INTO available, batch_owner FROM pig_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF batch_owner IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'Batch not found' USING ERRCODE = '23514'; END IF;
  IF NEW.count > available THEN RAISE EXCEPTION 'Deaths exceed remaining batch count' USING ERRCODE = '23514'; END IF;
  UPDATE pig_batches SET pig_count = pig_count - NEW.count WHERE id = NEW.batch_id;
  RETURN NEW;
 ELSIF TG_OP = 'DELETE' THEN
  UPDATE pig_batches SET pig_count = pig_count + OLD.count WHERE id = OLD.batch_id AND owner_id = OLD.owner_id;
  RETURN OLD;
 END IF;
 RAISE EXCEPTION 'Mortality records are immutable; delete a mistaken entry and record a correction';
END $$;
DROP TRIGGER IF EXISTS mortality_count ON mortality_records;
CREATE TRIGGER mortality_count BEFORE INSERT OR UPDATE OR DELETE ON mortality_records FOR EACH ROW EXECUTE FUNCTION apply_mortality_count();
ALTER TABLE mortality_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
COMMIT;
