CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pig_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code VARCHAR(50) UNIQUE NOT NULL,
    pig_count INTEGER NOT NULL,
    breed VARCHAR(100),
    start_weight DECIMAL(10,2),
    current_weight DECIMAL(10,2),
    date_acquired DATE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE feed_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES pig_batches(id) ON DELETE CASCADE,
    feed_type VARCHAR(100) NOT NULL,
    quantity_kg DECIMAL(10,2) NOT NULL,
    feeding_date DATE NOT NULL,
    feeding_time VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES pig_batches(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    vaccination_date DATE NOT NULL,
    next_due_date DATE,
    administered_by VARCHAR(100),
    dosage VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'Completed',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES pig_batches(id) ON DELETE SET NULL,
    expense_type VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES pig_batches(id) ON DELETE CASCADE,
    owner_id UUID,
    weight DECIMAL(10,2) NOT NULL DEFAULT 0,
    health_status VARCHAR(50) DEFAULT 'Healthy',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID,
    feed_type VARCHAR(100) NOT NULL,
    stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit_price DECIMAL(10,2) DEFAULT 0,
    last_updated DATE,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vaccine_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID,
    vaccine_name VARCHAR(100) NOT NULL,
    stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    expiry_date DATE,
    price_per_dose DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    fcm_token TEXT UNIQUE NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE feed_records ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE vaccination_records ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE pigs ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE feed_stocks ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE vaccine_stocks ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE feed_records ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_pig_batches_owner ON pig_batches (owner_id);
CREATE INDEX IF NOT EXISTS idx_feed_records_owner ON feed_records (owner_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_owner ON vaccination_records (owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON expenses (owner_id);
CREATE INDEX IF NOT EXISTS idx_pigs_owner ON pigs (owner_id);
CREATE INDEX IF NOT EXISTS idx_feed_stocks_owner ON feed_stocks (owner_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_stocks_owner ON vaccine_stocks (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_stocks_owner_type ON feed_stocks (owner_id, feed_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaccine_stocks_owner_name ON vaccine_stocks (owner_id, vaccine_name);

CREATE INDEX IF NOT EXISTS idx_pig_batches_created_at ON pig_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pig_batches_status ON pig_batches (status);
CREATE INDEX IF NOT EXISTS idx_feed_records_date ON feed_records (feeding_date DESC);
CREATE INDEX IF NOT EXISTS idx_feed_records_batch ON feed_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_feed_records_reminder ON feed_records (feeding_date, reminder_sent);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_date ON vaccination_records (vaccination_date DESC);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_due_status ON vaccination_records (next_due_date, status);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_batch ON vaccination_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date DESC);

-- RLS is enabled for direct database access. The backend uses the service-role
-- key and still applies owner_id filters in every controller.
ALTER TABLE pig_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccine_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pig_batches_owner_policy ON pig_batches;
CREATE POLICY pig_batches_owner_policy ON pig_batches
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS feed_records_owner_policy ON feed_records;
CREATE POLICY feed_records_owner_policy ON feed_records
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS vaccination_records_owner_policy ON vaccination_records;
CREATE POLICY vaccination_records_owner_policy ON vaccination_records
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS expenses_owner_policy ON expenses;
CREATE POLICY expenses_owner_policy ON expenses
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS pigs_owner_policy ON pigs;
CREATE POLICY pigs_owner_policy ON pigs
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS feed_stocks_owner_policy ON feed_stocks;
CREATE POLICY feed_stocks_owner_policy ON feed_stocks
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS vaccine_stocks_owner_policy ON vaccine_stocks;
CREATE POLICY vaccine_stocks_owner_policy ON vaccine_stocks
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS notifications_owner_policy ON notifications;
CREATE POLICY notifications_owner_policy ON notifications
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_devices_owner_policy ON user_devices;
CREATE POLICY user_devices_owner_policy ON user_devices
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());