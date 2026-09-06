    -- Cache tables for Vercel free tier deployment
    -- Run this in Supabase SQL Editor

    -- Enable pgcrypto for gen_random_uuid if needed
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Generic API cache table (reusable for any endpoint)
    CREATE TABLE IF NOT EXISTS api_cache (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

    -- Dashboard cache (5 min TTL)
    CREATE TABLE IF NOT EXISTS dashboard_cache (
        key TEXT PRIMARY KEY DEFAULT 'dashboard',
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Feed summary cache (10 min TTL)
    CREATE TABLE IF NOT EXISTS feed_summary_cache (
        key TEXT PRIMARY KEY DEFAULT 'feed_summary',
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Expense summary cache (10 min TTL)
    CREATE TABLE IF NOT EXISTS expense_summary_cache (
        key TEXT PRIMARY KEY DEFAULT 'expense_summary',
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Batch list cache (5 min TTL)
    CREATE TABLE IF NOT EXISTS batch_list_cache (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_batch_list_cache_expires ON batch_list_cache(expires_at);

    -- Function to clean expired cache entries (run manually or via cron)
    CREATE OR REPLACE FUNCTION clean_expired_cache()
    RETURNS void AS $$
    BEGIN
        DELETE FROM api_cache WHERE expires_at < NOW();
        DELETE FROM dashboard_cache WHERE expires_at < NOW();
        DELETE FROM feed_summary_cache WHERE expires_at < NOW();
        DELETE FROM expense_summary_cache WHERE expires_at < NOW();
        DELETE FROM batch_list_cache WHERE expires_at < NOW();
    END;
    $$ LANGUAGE plpgsql;

    -- Grant permissions (adjust for your Supabase roles)
    GRANT SELECT, INSERT, UPDATE, DELETE ON api_cache TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_cache TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON feed_summary_cache TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON expense_summary_cache TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON batch_list_cache TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION clean_expired_cache TO anon, authenticated;