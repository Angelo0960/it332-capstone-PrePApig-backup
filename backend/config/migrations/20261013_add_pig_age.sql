-- Preserve the age entered when a pig batch is created.
ALTER TABLE public.pig_batches
    ADD COLUMN IF NOT EXISTS age_on_acquisition INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pig_batches_age_on_acquisition_nonnegative'
    ) THEN
        ALTER TABLE public.pig_batches
            ADD CONSTRAINT pig_batches_age_on_acquisition_nonnegative
            CHECK (age_on_acquisition >= 0);
    END IF;
END $$;
