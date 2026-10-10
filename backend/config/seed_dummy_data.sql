-- PrepAPig dummy data seed
-- 1) Replace YOUR_LOGIN_EMAIL with the email used to log in to PrepAPig.
-- 2) Paste the complete script into Supabase SQL Editor and run it.
-- 3) The script removes only rows created by this seed for that user.

ALTER TABLE public.pig_batches ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.feed_records ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.vaccination_records ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.pigs ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.feed_stocks ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.vaccine_stocks ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE public.feed_stocks DROP CONSTRAINT IF EXISTS feed_stocks_feed_type_key;
ALTER TABLE public.vaccine_stocks DROP CONSTRAINT IF EXISTS vaccine_stocks_vaccine_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_stocks_owner_type ON public.feed_stocks (owner_id, feed_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaccine_stocks_owner_name ON public.vaccine_stocks (owner_id, vaccine_name);

DO $$
DECLARE
  v_owner_email TEXT := 'YOUR_LOGIN_EMAIL';
  v_owner_id UUID;
  v_batch_one UUID;
  v_batch_two UUID;
  v_code_one TEXT;
  v_code_two TEXT;
BEGIN
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE lower(email) = lower(v_owner_email)
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for %. Replace YOUR_LOGIN_EMAIL with the exact login email.', v_owner_email;
  END IF;

  v_code_one := 'DUMMY-001-' || substr(md5(v_owner_id::text || '-1'), 1, 8);
  v_code_two := 'DUMMY-002-' || substr(md5(v_owner_id::text || '-2'), 1, 8);

  -- Make this seed safe to run again for the same user.
  DELETE FROM public.notifications
  WHERE user_id = v_owner_id AND dedupe_key LIKE 'dummy-seed:%';

  DELETE FROM public.feed_stocks
  WHERE owner_id = v_owner_id
    AND feed_type IN ('Starter Mash', 'Grower Pellet', 'Finisher');

  DELETE FROM public.vaccine_stocks
  WHERE owner_id = v_owner_id
    AND vaccine_name IN ('Swine Fever', 'E. Coli', 'PRRS', 'Porcine Circovirus');

  DELETE FROM public.pig_batches
  WHERE owner_id = v_owner_id
    AND batch_code IN (v_code_one, v_code_two);

  INSERT INTO public.pig_batches
    (batch_code, pig_count, breed, start_weight, current_weight, date_acquired, status, owner_id)
  VALUES
    (v_code_one, 5, 'Landrace', 12.50, 57.50, CURRENT_DATE - 35, 'Active', v_owner_id)
  RETURNING id INTO v_batch_one;

  INSERT INTO public.pig_batches
    (batch_code, pig_count, breed, start_weight, current_weight, date_acquired, status, owner_id)
  VALUES
    (v_code_two, 4, 'Large White', 11.00, 34.00, CURRENT_DATE - 18, 'Active', v_owner_id)
  RETURNING id INTO v_batch_two;

  INSERT INTO public.pigs (batch_id, owner_id, weight, health_status, notes)
  SELECT v_batch_one, v_owner_id, weight, 'Healthy', 'Dummy seed pig'
  FROM unnest(ARRAY[55.0, 57.0, 58.5, 56.5, 60.0]::numeric[]) AS weight;

  INSERT INTO public.pigs (batch_id, owner_id, weight, health_status, notes)
  SELECT v_batch_two, v_owner_id, weight, 'Healthy', 'Dummy seed pig'
  FROM unnest(ARRAY[32.0, 34.0, 35.5, 33.5]::numeric[]) AS weight;

  INSERT INTO public.feed_stocks
    (owner_id, feed_type, stock_quantity, unit_price, last_updated, notes)
  VALUES
    (v_owner_id, 'Starter Mash', 48.00, 29.00, CURRENT_DATE, 'Dummy seed stock'),
    (v_owner_id, 'Grower Pellet', 245.00, 28.50, CURRENT_DATE, 'Dummy seed stock'),
    (v_owner_id, 'Finisher', 120.00, 27.00, CURRENT_DATE, 'Dummy seed stock');

  INSERT INTO public.vaccine_stocks
    (owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes)
  VALUES
    (v_owner_id, 'Swine Fever', 40, CURRENT_DATE + 180, 45.00, 'Dummy seed stock'),
    (v_owner_id, 'E. Coli', 35, CURRENT_DATE + 150, 38.50, 'Dummy seed stock'),
    (v_owner_id, 'PRRS', 25, CURRENT_DATE + 120, 52.00, 'Dummy seed stock'),
    (v_owner_id, 'Porcine Circovirus', 20, CURRENT_DATE + 120, 48.00, 'Dummy seed stock');

  INSERT INTO public.feed_records
    (owner_id, batch_id, feed_type, quantity_kg, feeding_date, feeding_time, notes)
  VALUES
    (v_owner_id, v_batch_one, 'Grower Pellet', 12.50, CURRENT_DATE - 1, '08:00', 'Dummy seed feeding'),
    (v_owner_id, v_batch_one, 'Grower Pellet', 11.75, CURRENT_DATE - 2, '08:15', 'Dummy seed feeding'),
    (v_owner_id, v_batch_two, 'Starter Mash', 8.00, CURRENT_DATE - 1, '07:45', 'Dummy seed feeding'),
    (v_owner_id, v_batch_two, 'Starter Mash', 7.50, CURRENT_DATE - 3, '08:10', 'Dummy seed feeding');

  INSERT INTO public.vaccination_records
    (owner_id, batch_id, vaccine_name, vaccination_date, next_due_date, administered_by, dosage, notes, status)
  VALUES
    (v_owner_id, v_batch_one, 'PRRS', CURRENT_DATE - 2, CURRENT_DATE + 28, 'Dummy Farmer', '5', 'Dummy seed vaccination', 'Completed'),
    (v_owner_id, v_batch_two, 'E. Coli', CURRENT_DATE - 1, CURRENT_DATE + 21, 'Dummy Farmer', '4', 'Dummy seed vaccination', 'Completed');

  INSERT INTO public.expenses
    (owner_id, batch_id, expense_type, amount, expense_date, description)
  VALUES
    (v_owner_id, v_batch_one, 'Feeds', 356.25, CURRENT_DATE - 1, 'Dummy seed feed expense'),
    (v_owner_id, v_batch_two, 'Vaccines', 154.00, CURRENT_DATE - 1, 'Dummy seed vaccine expense'),
    (v_owner_id, v_batch_one, 'Other', 500.00, CURRENT_DATE - 5, 'Dummy seed farm expense');

  INSERT INTO public.notifications
    (user_id, title, message, type, dedupe_key, is_read)
  VALUES
    (v_owner_id, 'Dummy data loaded', 'Dummy PrepAPig records are ready for testing.', 'system', 'dummy-seed:loaded', false),
    (v_owner_id, 'Feed reminder', 'Grower Pellet feeding is scheduled for the dummy batch.', 'feed_reminder', 'dummy-seed:feed-reminder', false);

  RAISE NOTICE 'Dummy data inserted for user % using batches % and %.', v_owner_email, v_code_one, v_code_two;
END $$;

-- Verify the seeded rows for the selected user.
SELECT
  (SELECT count(*) FROM public.pig_batches WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS batches,
  (SELECT count(*) FROM public.pigs WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS pigs,
  (SELECT count(*) FROM public.feed_records WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS feed_records,
  (SELECT count(*) FROM public.vaccination_records WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS vaccination_records,
  (SELECT count(*) FROM public.feed_stocks WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS feed_stock_rows,
  (SELECT count(*) FROM public.vaccine_stocks WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS vaccine_stock_rows,
  (SELECT count(*) FROM public.expenses WHERE owner_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL'))) AS expenses,
  (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_LOGIN_EMAIL')) AND dedupe_key LIKE 'dummy-seed:%') AS notifications;
