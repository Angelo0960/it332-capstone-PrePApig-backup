-- Main Application Tables Migration
-- Run this in Supabase SQL Editor BEFORE fcr_migration.sql

-- Enable pgcrypto for gen_random_uuid if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. PIG BATCHES (main batch table)
-- ============================================
CREATE TABLE IF NOT EXISTS pig_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code VARCHAR(50) UNIQUE NOT NULL,
    pig_count INTEGER NOT NULL DEFAULT 0,
    breed VARCHAR(100),
    start_weight DECIMAL(8,2) NOT NULL DEFAULT 0,
    current_weight DECIMAL(8,2) NOT NULL DEFAULT 0,
    date_acquired DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Completed' | 'Sold'
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weight history tracking (added in fcr_migration.sql)
-- ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS weight_history JSONB DEFAULT '[]'::jsonb;

-- FCR tracking (added in fcr_migration.sql)
-- ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS current_fcr DECIMAL(5,2);
-- ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_source VARCHAR(20) DEFAULT 'default';
-- ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_confidence VARCHAR(20);
-- ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_data_points INTEGER DEFAULT 0;

-- Indexes for pig_batches
CREATE INDEX IF NOT EXISTS idx_pig_batches_owner ON pig_batches(owner_id);
CREATE INDEX IF NOT EXISTS idx_pig_batches_status ON pig_batches(status);
CREATE INDEX IF NOT EXISTS idx_pig_batches_date_acquired ON pig_batches(date_acquired);

-- ============================================
-- 2. INDIVIDUAL PIGS
-- ============================================
CREATE TABLE IF NOT EXISTS pigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES pig_batches(id) ON DELETE CASCADE,
    weight DECIMAL(8,2) NOT NULL DEFAULT 0,
    health_status VARCHAR(20) NOT NULL DEFAULT 'Healthy', -- 'Healthy' | 'Sick' | 'Recovering'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pigs_batch ON pigs(batch_id);
CREATE INDEX IF NOT EXISTS idx_pigs_health ON pigs(health_status);

-- ============================================
-- 3. FEED RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS feed_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES pig_batches(id) ON DELETE CASCADE,
    feed_type VARCHAR(100) NOT NULL, -- 'Starter Mash', 'Grower Pellet', 'Finisher', etc.
    quantity_kg DECIMAL(8,2) NOT NULL,
    feeding_date DATE NOT NULL,
    feeding_time TIME,
    notes TEXT,
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_records_batch ON feed_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_feed_records_date ON feed_records(feeding_date);
CREATE INDEX IF NOT EXISTS idx_feed_records_reminder ON feed_records(reminder_sent) WHERE reminder_sent = FALSE;

-- ============================================
-- 4. FEED STOCKS
-- ============================================
CREATE TABLE IF NOT EXISTS feed_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_type VARCHAR(100) UNIQUE NOT NULL,
    stock_quantity DECIMAL(8,2) NOT NULL DEFAULT 0,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. VACCINATION RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES pig_batches(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL, -- 'Swine Fever', 'E. Coli', 'PRRS', 'Porcine Circovirus'
    vaccination_date DATE NOT NULL,
    next_due_date DATE,
    administered_by VARCHAR(100),
    dosage INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Completed', -- 'Completed' | 'Scheduled' | 'Overdue'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_batch ON vaccination_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_date ON vaccination_records(vaccination_date);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_next_due ON vaccination_records(next_due_date) WHERE next_due_date IS NOT NULL;

-- ============================================
-- 6. VACCINE STOCKS
-- ============================================
CREATE TABLE IF NOT EXISTS vaccine_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaccine_name VARCHAR(100) UNIQUE NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    price_per_dose DECIMAL(10,2),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. EXPENSES
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES pig_batches(id) ON DELETE SET NULL,
    expense_type VARCHAR(50) NOT NULL, -- 'Feeds', 'Vaccines', 'Medicine', 'Equipment', 'Other'
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_batch ON expenses(batch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- ============================================
-- 8. NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50), -- 'vaccination', 'feed_reminder', 'vaccination_reminder', 'vaccination_overdue', 'general'
    is_read BOOLEAN DEFAULT FALSE,
    recipient_token VARCHAR(500), -- Legacy FCM token storage
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- 9. USER DEVICES (for FCM tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fcm_token VARCHAR(500) UNIQUE NOT NULL,
    device_type VARCHAR(20), -- 'web', 'android', 'ios'
    app_version VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON user_devices(fcm_token);

-- ============================================
-- 10. MARKET PRICE REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS market_price_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    price_per_kg DECIMAL(10,2) NOT NULL,
    source VARCHAR(100), -- 'gemini', 'manual', 'api'
    region VARCHAR(100) DEFAULT 'Philippines',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_price_reports_date ON market_price_reports(report_date DESC);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
DROP TRIGGER IF EXISTS update_pig_batches_updated_at ON pig_batches;
CREATE TRIGGER update_pig_batches_updated_at
    BEFORE UPDATE ON pig_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pigs_updated_at ON pigs;
CREATE TRIGGER update_pigs_updated_at
    BEFORE UPDATE ON pigs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feed_records_updated_at ON feed_records;
CREATE TRIGGER update_feed_records_updated_at
    BEFORE UPDATE ON feed_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feed_stocks_updated_at ON feed_stocks;
CREATE TRIGGER update_feed_stocks_updated_at
    BEFORE UPDATE ON feed_stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaccination_records_updated_at ON vaccination_records;
CREATE TRIGGER update_vaccination_records_updated_at
    BEFORE UPDATE ON vaccination_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vaccine_stocks_updated_at ON vaccine_stocks;
CREATE TRIGGER update_vaccine_stocks_updated_at
    BEFORE UPDATE ON vaccine_stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_devices_updated_at ON user_devices;
CREATE TRIGGER update_user_devices_updated_at
    BEFORE UPDATE ON user_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_market_price_reports_updated_at ON market_price_reports;
CREATE TRIGGER update_market_price_reports_updated_at
    BEFORE UPDATE ON market_price_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on all tables
ALTER TABLE pig_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccine_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_price_reports ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own data
-- pig_batches
CREATE POLICY "Users can view own batches" ON pig_batches
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own batches" ON pig_batches
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own batches" ON pig_batches
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own batches" ON pig_batches
    FOR DELETE USING (auth.uid() = owner_id);

-- pigs
CREATE POLICY "Users can view own pigs" ON pigs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = pigs.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can insert own pigs" ON pigs
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = pigs.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can update own pigs" ON pigs
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = pigs.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can delete own pigs" ON pigs
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = pigs.batch_id AND pig_batches.owner_id = auth.uid())
    );

-- feed_records
CREATE POLICY "Users can view own feed records" ON feed_records
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = feed_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can insert own feed records" ON feed_records
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = feed_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can update own feed records" ON feed_records
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = feed_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can delete own feed records" ON feed_records
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = feed_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

-- feed_stocks (public read, authenticated write)
CREATE POLICY "Anyone can view feed stocks" ON feed_stocks FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage feed stocks" ON feed_stocks
    FOR ALL USING (auth.role() = 'authenticated');

-- vaccination_records
CREATE POLICY "Users can view own vaccination records" ON vaccination_records
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = vaccination_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can insert own vaccination records" ON vaccination_records
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = vaccination_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can update own vaccination records" ON vaccination_records
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = vaccination_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can delete own vaccination records" ON vaccination_records
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = vaccination_records.batch_id AND pig_batches.owner_id = auth.uid())
    );

-- vaccine_stocks (public read, authenticated write)
CREATE POLICY "Anyone can view vaccine stocks" ON vaccine_stocks FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage vaccine stocks" ON vaccine_stocks
    FOR ALL USING (auth.role() = 'authenticated');

-- expenses
CREATE POLICY "Users can view own expenses" ON expenses
    FOR SELECT USING (
        batch_id IS NULL OR EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = expenses.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can insert own expenses" ON expenses
    FOR INSERT WITH CHECK (
        batch_id IS NULL OR EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = expenses.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can update own expenses" ON expenses
    FOR UPDATE USING (
        batch_id IS NULL OR EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = expenses.batch_id AND pig_batches.owner_id = auth.uid())
    );

CREATE POLICY "Users can delete own expenses" ON expenses
    FOR DELETE USING (
        batch_id IS NULL OR EXISTS (SELECT 1 FROM pig_batches WHERE pig_batches.id = expenses.batch_id AND pig_batches.owner_id = auth.uid())
    );

-- notifications
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications" ON notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- user_devices
CREATE POLICY "Users can view own devices" ON user_devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices" ON user_devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices" ON user_devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices" ON user_devices
    FOR DELETE USING (auth.uid() = user_id);

-- market_price_reports (public read)
CREATE POLICY "Anyone can view market prices" ON market_price_reports FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage market prices" ON market_price_reports
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- DEFAULT DATA SEEDING
-- ============================================
-- Insert default feed stocks (upsert to avoid duplicates)
INSERT INTO feed_stocks (feed_type, stock_quantity, unit_price) VALUES
    ('Starter Mash', 0, 29.0),
    ('Grower Pellet', 0, 28.5),
    ('Finisher', 0, 27.0)
ON CONFLICT (feed_type) DO NOTHING;

-- Insert default vaccine stocks (upsert to avoid duplicates)
INSERT INTO vaccine_stocks (vaccine_name, stock_quantity, price_per_dose) VALUES
    ('Swine Fever', 0, 45.0),
    ('E. Coli', 0, 38.5),
    ('PRRS', 0, 52.0),
    ('Porcine Circovirus', 0, 48.0)
ON CONFLICT (vaccine_name) DO NOTHING;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON pig_batches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pigs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_stocks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vaccination_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vaccine_stocks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_devices TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_price_reports TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;