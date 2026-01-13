import { BaseRepository } from "./base"
import type {
  DashboardStats,
  MarketPriceHistory,
  OpportunityTrend,
  PlatformComparison,
  TopMarket,
  ProfitTimeSeries,
  HourlyStats,
} from "../types"

/**
 * Analytics Repository - Advanced TimescaleDB queries for insights
 */
export class AnalyticsRepository extends BaseRepository {
  // ============================================
  // Dashboard Statistics
  // ============================================

  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const [marketStats] = await this.sql<
      {
        total_markets: number
        kalshi_markets: number
        polymarket_markets: number
        active_markets: number
      }[]
    >`
      SELECT
        COUNT(*)::integer AS total_markets,
        COUNT(*) FILTER (WHERE platform_id = 1)::integer AS kalshi_markets,
        COUNT(*) FILTER (WHERE platform_id = 2)::integer AS polymarket_markets,
        COUNT(*) FILTER (WHERE status = 'open')::integer AS active_markets
      FROM markets
    `

    const [opportunityStats] = await this.sql<
      {
        active_opportunities: number
        cross_market_active: number
        intra_market_active: number
        total_detected_24h: number
        avg_profit_margin: number
        max_profit_margin: number
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::integer AS active_opportunities,
        COUNT(*) FILTER (WHERE status = 'active' AND type = 'cross-market')::integer AS cross_market_active,
        COUNT(*) FILTER (WHERE status = 'active' AND type = 'intra-market')::integer AS intra_market_active,
        COUNT(*) FILTER (WHERE detected_at >= NOW() - INTERVAL '24 hours')::integer AS total_detected_24h,
        COALESCE(AVG(profit_margin) FILTER (WHERE status = 'active'), 0)::numeric(8,4) AS avg_profit_margin,
        COALESCE(MAX(profit_margin) FILTER (WHERE status = 'active'), 0)::numeric(8,4) AS max_profit_margin
      FROM arbitrage_opportunities
    `

    const [snapshotStats] = await this.sql<
      {
        snapshots_24h: number
        snapshots_1h: number
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE time >= NOW() - INTERVAL '24 hours')::integer AS snapshots_24h,
        COUNT(*) FILTER (WHERE time >= NOW() - INTERVAL '1 hour')::integer AS snapshots_1h
      FROM market_snapshots
    `

    const [scanStats] = await this.sql<
      {
        scans_24h: number
        successful_scans_24h: number
        avg_scan_duration_ms: number
      }[]
    >`
      SELECT
        COUNT(*)::integer AS scans_24h,
        COUNT(*) FILTER (WHERE status = 'completed')::integer AS successful_scans_24h,
        COALESCE(AVG(duration_ms)::integer, 0) AS avg_scan_duration_ms
      FROM scan_history
      WHERE started_at >= NOW() - INTERVAL '24 hours'
    `

    return {
      markets: {
        total: marketStats?.total_markets ?? 0,
        kalshi: marketStats?.kalshi_markets ?? 0,
        polymarket: marketStats?.polymarket_markets ?? 0,
        active: marketStats?.active_markets ?? 0,
      },
      opportunities: {
        active: opportunityStats?.active_opportunities ?? 0,
        crossMarket: opportunityStats?.cross_market_active ?? 0,
        intraMarket: opportunityStats?.intra_market_active ?? 0,
        detected24h: opportunityStats?.total_detected_24h ?? 0,
        avgProfitMargin: Number(opportunityStats?.avg_profit_margin ?? 0),
        maxProfitMargin: Number(opportunityStats?.max_profit_margin ?? 0),
      },
      snapshots: {
        last24h: snapshotStats?.snapshots_24h ?? 0,
        lastHour: snapshotStats?.snapshots_1h ?? 0,
      },
      scans: {
        last24h: scanStats?.scans_24h ?? 0,
        successful: scanStats?.successful_scans_24h ?? 0,
        avgDurationMs: scanStats?.avg_scan_duration_ms ?? 0,
      },
    }
  }

  // ============================================
  // Market Price Analytics
  // ============================================

  /**
   * Get price history with hourly buckets for a market
   */
  async getMarketPriceHistory(
    marketDbId: string,
    hoursBack = 24
  ): Promise<MarketPriceHistory[]> {
    return this.sql<MarketPriceHistory[]>`
      SELECT
        time_bucket('1 hour', time) AS bucket,
        AVG(yes_price)::numeric(6,5) AS avg_yes_price,
        AVG(no_price)::numeric(6,5) AS avg_no_price,
        MIN(yes_price)::numeric(6,5) AS min_yes_price,
        MAX(yes_price)::numeric(6,5) AS max_yes_price,
        MIN(no_price)::numeric(6,5) AS min_no_price,
        MAX(no_price)::numeric(6,5) AS max_no_price,
        AVG(volume)::numeric(18,2) AS avg_volume,
        COUNT(*)::integer AS sample_count
      FROM market_snapshots
      WHERE market_id = ${marketDbId}
        AND time >= NOW() - ${hoursBack + " hours"}::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  /**
   * Get price history with gap filling (fills in missing time buckets)
   */
  async getMarketPriceHistoryGapfilled(
    marketDbId: string,
    hoursBack = 24,
    bucketMinutes = 15
  ): Promise<MarketPriceHistory[]> {
    const intervalStr = `${bucketMinutes} minutes`
    return this.sql<MarketPriceHistory[]>`
      SELECT
        time_bucket_gapfill(${intervalStr}::interval, time) AS bucket,
        COALESCE(AVG(yes_price), locf(AVG(yes_price)))::numeric(6,5) AS avg_yes_price,
        COALESCE(AVG(no_price), locf(AVG(no_price)))::numeric(6,5) AS avg_no_price,
        MIN(yes_price)::numeric(6,5) AS min_yes_price,
        MAX(yes_price)::numeric(6,5) AS max_yes_price,
        MIN(no_price)::numeric(6,5) AS min_no_price,
        MAX(no_price)::numeric(6,5) AS max_no_price,
        AVG(volume)::numeric(18,2) AS avg_volume,
        COALESCE(COUNT(*), 0)::integer AS sample_count
      FROM market_snapshots
      WHERE market_id = ${marketDbId}
        AND time >= NOW() - ${hoursBack + " hours"}::interval
        AND time <= NOW()
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  /**
   * Get top markets by volume in the last 24 hours
   */
  async getTopMarketsByVolume(limit = 10): Promise<TopMarket[]> {
    return this.sql<TopMarket[]>`
      SELECT
        m.id AS market_db_id,
        m.external_id,
        m.ticker,
        m.title,
        p.name AS platform,
        COALESCE(AVG(ms.volume), 0)::numeric(18,2) AS avg_volume,
        COALESCE(MAX(ms.volume), 0)::numeric(18,2) AS max_volume,
        COUNT(ms.*)::integer AS snapshot_count,
        (SELECT yes_price FROM market_snapshots
         WHERE market_id = m.id ORDER BY time DESC LIMIT 1)::numeric(6,5) AS current_price
      FROM markets m
      JOIN platforms p ON m.platform_id = p.id
      LEFT JOIN market_snapshots ms ON ms.market_id = m.id
        AND ms.time >= NOW() - INTERVAL '24 hours'
      WHERE m.status = 'open'
      GROUP BY m.id, m.external_id, m.ticker, m.title, p.name
      HAVING COUNT(ms.*) > 0
      ORDER BY avg_volume DESC NULLS LAST
      LIMIT ${limit}
    `
  }

  /**
   * Get top markets by price volatility
   */
  async getTopMarketsByVolatility(limit = 10): Promise<TopMarket[]> {
    return this.sql<TopMarket[]>`
      WITH volatility AS (
        SELECT
          market_id,
          STDDEV(yes_price) AS price_stddev,
          MAX(yes_price) - MIN(yes_price) AS price_range
        FROM market_snapshots
        WHERE time >= NOW() - INTERVAL '24 hours'
        GROUP BY market_id
        HAVING COUNT(*) >= 5
      )
      SELECT
        m.id AS market_db_id,
        m.external_id,
        m.ticker,
        m.title,
        p.name AS platform,
        v.price_stddev::numeric(6,5) AS volatility,
        v.price_range::numeric(6,5) AS price_range,
        (SELECT yes_price FROM market_snapshots
         WHERE market_id = m.id ORDER BY time DESC LIMIT 1)::numeric(6,5) AS current_price
      FROM markets m
      JOIN platforms p ON m.platform_id = p.id
      JOIN volatility v ON v.market_id = m.id
      WHERE m.status = 'open'
      ORDER BY v.price_stddev DESC
      LIMIT ${limit}
    `
  }

  // ============================================
  // Opportunity Analytics
  // ============================================

  /**
   * Get opportunity profit trends over time
   */
  async getOpportunityTrends(hoursBack = 24): Promise<OpportunityTrend[]> {
    return this.sql<OpportunityTrend[]>`
      SELECT
        time_bucket('1 hour', detected_at) AS bucket,
        type,
        COUNT(*)::integer AS opportunity_count,
        AVG(profit_margin)::numeric(8,4) AS avg_profit,
        MAX(profit_margin)::numeric(8,4) AS max_profit,
        MIN(profit_margin)::numeric(8,4) AS min_profit
      FROM arbitrage_opportunities
      WHERE detected_at >= NOW() - ${hoursBack + " hours"}::interval
      GROUP BY bucket, type
      ORDER BY bucket ASC, type
    `
  }

  /**
   * Get detailed profit time series for a specific opportunity
   */
  async getOpportunityProfitTimeSeries(
    opportunityId: string,
    hoursBack = 4
  ): Promise<ProfitTimeSeries[]> {
    return this.sql<ProfitTimeSeries[]>`
      SELECT
        time_bucket('5 minutes', time) AS bucket,
        AVG(profit_margin)::numeric(8,4) AS avg_profit_margin,
        MIN(profit_margin)::numeric(8,4) AS min_profit_margin,
        MAX(profit_margin)::numeric(8,4) AS max_profit_margin,
        AVG(kalshi_yes_price)::numeric(6,5) AS avg_kalshi_yes,
        AVG(polymarket_yes_price)::numeric(6,5) AS avg_poly_yes,
        COUNT(*)::integer AS sample_count
      FROM opportunity_snapshots
      WHERE opportunity_id = ${opportunityId}
        AND time >= NOW() - ${hoursBack + " hours"}::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  /**
   * Get best opportunities by category/time period
   */
  async getBestOpportunitiesByPeriod(
    period: "1h" | "6h" | "24h" | "7d" = "24h",
    limit = 10
  ) {
    const intervalMap = {
      "1h": "1 hour",
      "6h": "6 hours",
      "24h": "24 hours",
      "7d": "7 days",
    }
    const interval = intervalMap[period]

    return this.sql`
      SELECT
        ao.id,
        ao.type,
        ao.profit_margin,
        ao.expected_profit,
        ao.detected_at,
        ao.status,
        CASE
          WHEN ao.type = 'cross-market' THEN km.title
          ELSE im.title
        END AS market_title,
        CASE
          WHEN ao.type = 'cross-market' THEN pm.title
          ELSE NULL
        END AS paired_market_title
      FROM arbitrage_opportunities ao
      LEFT JOIN markets km ON ao.kalshi_market_id = km.id
      LEFT JOIN markets pm ON ao.polymarket_market_id = pm.id
      LEFT JOIN markets im ON ao.market_id = im.id
      WHERE ao.detected_at >= NOW() - ${interval}::interval
      ORDER BY ao.profit_margin DESC
      LIMIT ${limit}
    `
  }

  // ============================================
  // Platform Comparison Analytics
  // ============================================

  /**
   * Compare prices between platforms for matched markets
   */
  async getPlatformPriceComparison(): Promise<PlatformComparison[]> {
    return this.sql<PlatformComparison[]>`
      WITH latest_kalshi AS (
        SELECT DISTINCT ON (m.id)
          m.id,
          m.ticker,
          m.title,
          ms.yes_price,
          ms.no_price,
          ms.time
        FROM markets m
        JOIN market_snapshots ms ON ms.market_id = m.id
        WHERE m.platform_id = 1 AND m.status = 'open'
        ORDER BY m.id, ms.time DESC
      ),
      latest_poly AS (
        SELECT DISTINCT ON (m.id)
          m.id,
          m.ticker,
          m.title,
          ms.yes_price,
          ms.no_price,
          ms.time
        FROM markets m
        JOIN market_snapshots ms ON ms.market_id = m.id
        WHERE m.platform_id = 2 AND m.status = 'open'
        ORDER BY m.id, ms.time DESC
      )
      SELECT
        k.ticker,
        k.title,
        k.yes_price AS kalshi_yes_price,
        p.yes_price AS polymarket_yes_price,
        ABS(k.yes_price - p.yes_price)::numeric(6,5) AS price_difference,
        CASE
          WHEN k.yes_price > p.yes_price THEN 'kalshi_higher'
          WHEN p.yes_price > k.yes_price THEN 'polymarket_higher'
          ELSE 'equal'
        END AS comparison
      FROM latest_kalshi k
      JOIN latest_poly p ON LOWER(k.ticker) = LOWER(p.ticker)
        OR k.title ILIKE '%' || p.ticker || '%'
      ORDER BY price_difference DESC
      LIMIT 20
    `
  }

  // ============================================
  // Hourly Statistics (using continuous aggregates)
  // ============================================

  /**
   * Get hourly stats from the continuous aggregate
   */
  async getHourlyPriceStats(
    marketDbId: string,
    hoursBack = 48
  ): Promise<HourlyStats[]> {
    return this.sql<HourlyStats[]>`
      SELECT
        bucket,
        avg_yes_price,
        avg_no_price,
        min_yes_price,
        max_yes_price,
        avg_volume,
        sample_count
      FROM market_prices_hourly
      WHERE market_id = ${marketDbId}
        AND bucket >= NOW() - ${hoursBack + " hours"}::interval
      ORDER BY bucket ASC
    `
  }

  /**
   * Get daily opportunity summary from continuous aggregate
   */
  async getDailyOpportunitySummary(daysBack = 7) {
    return this.sql`
      SELECT
        od.bucket,
        ao.type,
        COUNT(DISTINCT od.opportunity_id)::integer AS opportunity_count,
        AVG(od.avg_profit_margin)::numeric(8,4) AS avg_profit,
        MAX(od.max_profit_margin)::numeric(8,4) AS max_profit
      FROM opportunities_daily od
      JOIN arbitrage_opportunities ao ON od.opportunity_id = ao.id
      WHERE od.bucket >= NOW() - ${daysBack + " days"}::interval
      GROUP BY od.bucket, ao.type
      ORDER BY od.bucket ASC, ao.type
    `
  }

  // ============================================
  // Performance & Health Analytics
  // ============================================

  /**
   * Get scan performance over time
   */
  async getScanPerformanceHistory(hoursBack = 24) {
    return this.sql`
      SELECT
        time_bucket('1 hour', started_at) AS bucket,
        COUNT(*)::integer AS scan_count,
        COUNT(*) FILTER (WHERE status = 'completed')::integer AS success_count,
        COUNT(*) FILTER (WHERE status = 'failed')::integer AS fail_count,
        AVG(duration_ms)::integer AS avg_duration_ms,
        MAX(duration_ms)::integer AS max_duration_ms,
        SUM(cross_opportunities_found)::integer AS total_cross_opps,
        SUM(intra_opportunities_found)::integer AS total_intra_opps
      FROM scan_history
      WHERE started_at >= NOW() - ${hoursBack + " hours"}::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  /**
   * Get database health metrics
   */
  async getDatabaseHealth() {
    const [hypertableInfo] = await this.sql`
      SELECT
        hypertable_name,
        num_chunks,
        pg_size_pretty(total_bytes) as total_size,
        pg_size_pretty(index_bytes) as index_size,
        pg_size_pretty(table_bytes) as table_size
      FROM hypertable_detailed_size('market_snapshots')
      LIMIT 1
    `

    const [compressionStats] = await this.sql`
      SELECT
        COUNT(*) FILTER (WHERE is_compressed)::integer AS compressed_chunks,
        COUNT(*) FILTER (WHERE NOT is_compressed)::integer AS uncompressed_chunks
      FROM timescaledb_information.chunks
      WHERE hypertable_name = 'market_snapshots'
    `

    return {
      hypertable: hypertableInfo,
      compression: compressionStats,
    }
  }

  // ============================================
  // Real-time Analytics
  // ============================================

  /**
   * Get live spread analysis for all active markets
   */
  async getLiveSpreadAnalysis() {
    return this.sql`
      WITH latest AS (
        SELECT DISTINCT ON (market_id)
          market_id,
          yes_price,
          no_price,
          (1 - yes_price - no_price) AS spread,
          time
        FROM market_snapshots
        WHERE time >= NOW() - INTERVAL '5 minutes'
        ORDER BY market_id, time DESC
      )
      SELECT
        m.id AS market_db_id,
        m.ticker,
        m.title,
        p.name AS platform,
        l.yes_price,
        l.no_price,
        l.spread::numeric(6,5) AS spread,
        l.time AS last_update,
        CASE
          WHEN l.spread < -0.02 THEN 'arbitrage_opportunity'
          WHEN l.spread < 0 THEN 'slight_inefficiency'
          WHEN l.spread < 0.05 THEN 'normal'
          ELSE 'wide_spread'
        END AS spread_status
      FROM latest l
      JOIN markets m ON l.market_id = m.id
      JOIN platforms p ON m.platform_id = p.id
      ORDER BY l.spread ASC
      LIMIT 50
    `
  }

  /**
   * Get moving average of opportunity profit margins
   */
  async getOpportunityMovingAverage(windowMinutes = 30) {
    return this.sql`
      SELECT
        time_bucket('5 minutes', detected_at) AS bucket,
        type,
        AVG(profit_margin) OVER (
          PARTITION BY type
          ORDER BY time_bucket('5 minutes', detected_at)
          RANGE BETWEEN ${windowMinutes + " minutes"}::interval PRECEDING AND CURRENT ROW
        )::numeric(8,4) AS moving_avg_profit,
        COUNT(*) OVER (
          PARTITION BY type
          ORDER BY time_bucket('5 minutes', detected_at)
          RANGE BETWEEN ${windowMinutes + " minutes"}::interval PRECEDING AND CURRENT ROW
        )::integer AS window_count
      FROM arbitrage_opportunities
      WHERE detected_at >= NOW() - INTERVAL '24 hours'
      ORDER BY bucket DESC, type
      LIMIT 100
    `
  }
}

export const analyticsRepository = new AnalyticsRepository()
