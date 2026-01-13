-- ============================================
-- PostgreSQL + TimescaleDB Schema for Prediction Markets
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Platforms (Reference Data)
-- ============================================
CREATE TABLE platforms (
    id SMALLSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    taker_fee DECIMAL(5,4) NOT NULL DEFAULT 0,
    maker_fee DECIMAL(5,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platforms (name, display_name, taker_fee, maker_fee) VALUES
    ('kalshi', 'Kalshi', 0.07, 0.0),
    ('polymarket', 'Polymarket', 0.02, 0.0);

-- ============================================
-- 2. Markets (Deduplicated Market Metadata)
-- ============================================
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id SMALLINT NOT NULL REFERENCES platforms(id),
    external_id VARCHAR(255) NOT NULL,
    ticker VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    end_date TIMESTAMPTZ,

    -- Dome API specific fields
    dome_market_slug VARCHAR(255),
    dome_condition_id VARCHAR(255),
    dome_market_ticker VARCHAR(255),
    dome_event_ticker VARCHAR(255),
    dome_side_a_id VARCHAR(255),
    dome_side_a_label VARCHAR(255),
    dome_side_b_id VARCHAR(255),
    dome_side_b_label VARCHAR(255),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint for deduplication
    CONSTRAINT markets_platform_external_unique UNIQUE (platform_id, external_id)
);

CREATE INDEX idx_markets_platform_status ON markets(platform_id, status);
CREATE INDEX idx_markets_ticker ON markets(ticker);
CREATE INDEX idx_markets_dome_slug ON markets(dome_market_slug) WHERE dome_market_slug IS NOT NULL;

-- ============================================
-- 3. Market Snapshots (Time-Series Hypertable)
-- ============================================
CREATE TABLE market_snapshots (
    time TIMESTAMPTZ NOT NULL,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- Price data (0-1 range)
    yes_price DECIMAL(6,5) NOT NULL,
    no_price DECIMAL(6,5) NOT NULL,
    yes_bid DECIMAL(6,5),
    yes_ask DECIMAL(6,5),
    no_bid DECIMAL(6,5),
    no_ask DECIMAL(6,5),

    -- Volume/liquidity
    volume DECIMAL(18,2),
    liquidity DECIMAL(18,2),

    -- Source tracking
    source VARCHAR(20) NOT NULL DEFAULT 'api',

    PRIMARY KEY (time, market_id)
);

-- Convert to hypertable with 1-day chunks
SELECT create_hypertable('market_snapshots', by_range('time', INTERVAL '1 day'));

CREATE INDEX idx_market_snapshots_market_time ON market_snapshots(market_id, time DESC);

-- ============================================
-- 4. Arbitrage Opportunities
-- ============================================
CREATE TABLE arbitrage_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('cross-market', 'intra-market')),

    -- For cross-market: both markets
    kalshi_market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    polymarket_market_id UUID REFERENCES markets(id) ON DELETE SET NULL,

    -- For intra-market: single market
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,

    -- Trade details (JSON for flexibility)
    trade_details JSONB NOT NULL DEFAULT '{}',

    -- Profit metrics
    profit_margin DECIMAL(8,4) NOT NULL,
    required_capital DECIMAL(18,2) NOT NULL DEFAULT 100,
    expected_profit DECIMAL(18,2) NOT NULL,
    confidence DECIMAL(5,4),

    -- Timestamps
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'executed', 'missed'))
);

CREATE INDEX idx_opportunities_type_status ON arbitrage_opportunities(type, status);
CREATE INDEX idx_opportunities_detected_at ON arbitrage_opportunities(detected_at DESC);
CREATE INDEX idx_opportunities_profit ON arbitrage_opportunities(profit_margin DESC) WHERE status = 'active';

-- ============================================
-- 5. Opportunity Snapshots (Time-Series Hypertable)
-- ============================================
CREATE TABLE opportunity_snapshots (
    time TIMESTAMPTZ NOT NULL,
    opportunity_id UUID NOT NULL REFERENCES arbitrage_opportunities(id) ON DELETE CASCADE,

    -- Snapshot of profit at this moment
    profit_margin DECIMAL(8,4) NOT NULL,

    -- Cross-market prices
    kalshi_yes_price DECIMAL(6,5),
    kalshi_no_price DECIMAL(6,5),
    polymarket_yes_price DECIMAL(6,5),
    polymarket_no_price DECIMAL(6,5),

    -- Intra-market prices
    market_yes_price DECIMAL(6,5),
    market_no_price DECIMAL(6,5),
    spread DECIMAL(6,5),

    PRIMARY KEY (time, opportunity_id)
);

SELECT create_hypertable('opportunity_snapshots', by_range('time', INTERVAL '1 hour'));

-- ============================================
-- 6. Executions (Trade Tracking)
-- ============================================
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID REFERENCES arbitrage_opportunities(id) ON DELETE SET NULL,

    -- Execution details
    platform_id SMALLINT NOT NULL REFERENCES platforms(id),
    market_id UUID NOT NULL REFERENCES markets(id),
    side VARCHAR(3) NOT NULL CHECK (side IN ('yes', 'no')),
    action VARCHAR(4) NOT NULL CHECK (action IN ('buy', 'sell')),

    -- Order details
    quantity DECIMAL(18,8) NOT NULL,
    price DECIMAL(6,5) NOT NULL,
    fees DECIMAL(18,8) NOT NULL DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'filled', 'partial', 'cancelled', 'failed')),

    -- External reference
    external_order_id VARCHAR(255),
    external_trade_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ,

    -- Result
    fill_price DECIMAL(6,5),
    fill_quantity DECIMAL(18,8),
    actual_fees DECIMAL(18,8)
);

CREATE INDEX idx_executions_opportunity ON executions(opportunity_id);
CREATE INDEX idx_executions_market ON executions(market_id);
CREATE INDEX idx_executions_status ON executions(status) WHERE status IN ('pending', 'submitted');

-- ============================================
-- 7. Scan History (Audit Trail)
-- ============================================
CREATE TABLE scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Results
    kalshi_markets_count INTEGER,
    polymarket_markets_count INTEGER,
    cross_opportunities_found INTEGER,
    intra_opportunities_found INTEGER,

    -- Performance
    duration_ms INTEGER,

    -- Errors
    error_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX idx_scan_history_started ON scan_history(started_at DESC);

-- ============================================
-- 8. Compression Policies
-- ============================================

-- Compress market_snapshots after 7 days
ALTER TABLE market_snapshots SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'market_id'
);

SELECT add_compression_policy('market_snapshots', INTERVAL '7 days');

-- Compress opportunity_snapshots after 1 day
ALTER TABLE opportunity_snapshots SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'opportunity_id'
);

SELECT add_compression_policy('opportunity_snapshots', INTERVAL '1 day');

-- ============================================
-- 9. Retention Policies
-- ============================================

-- Keep market_snapshots for 90 days
SELECT add_retention_policy('market_snapshots', INTERVAL '90 days');

-- Keep opportunity_snapshots for 30 days
SELECT add_retention_policy('opportunity_snapshots', INTERVAL '30 days');

-- ============================================
-- 10. Continuous Aggregates
-- ============================================

-- Hourly market price summary
CREATE MATERIALIZED VIEW market_prices_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    market_id,
    AVG(yes_price) AS avg_yes_price,
    AVG(no_price) AS avg_no_price,
    MIN(yes_price) AS min_yes_price,
    MAX(yes_price) AS max_yes_price,
    AVG(volume) AS avg_volume,
    COUNT(*) AS sample_count
FROM market_snapshots
GROUP BY bucket, market_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_prices_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Daily opportunity summary
CREATE MATERIALIZED VIEW opportunities_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    opportunity_id,
    AVG(profit_margin) AS avg_profit_margin,
    MAX(profit_margin) AS max_profit_margin,
    MIN(profit_margin) AS min_profit_margin,
    COUNT(*) AS snapshot_count
FROM opportunity_snapshots
GROUP BY bucket, opportunity_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('opportunities_daily',
    start_offset => INTERVAL '2 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- ============================================
-- Done!
-- ============================================
