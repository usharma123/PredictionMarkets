import { BaseRepository } from "./base"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../../models/opportunity"
import type { DbOpportunity, DbScanHistory } from "../types"

export class OpportunitiesRepository extends BaseRepository {
  /**
   * Insert or update a cross-market opportunity
   */
  async upsertCrossMarketOpportunity(
    opp: ArbitrageOpportunity,
    kalshiDbId: string | null,
    polymarketDbId: string | null
  ): Promise<string> {
    const [result] = await this.sql`
      INSERT INTO arbitrage_opportunities (
        id, type, kalshi_market_id, polymarket_market_id,
        trade_details, profit_margin, required_capital, expected_profit,
        confidence, detected_at, status
      ) VALUES (
        ${opp.id}, 'cross-market', ${kalshiDbId}, ${polymarketDbId},
        ${JSON.stringify(opp.trade)}, ${opp.profitMargin}, ${opp.requiredCapital},
        ${opp.expectedProfit}, ${opp.confidence}, ${opp.detectedAt}, 'active'
      )
      ON CONFLICT (id) DO UPDATE SET
        profit_margin = EXCLUDED.profit_margin,
        expected_profit = EXCLUDED.expected_profit,
        trade_details = EXCLUDED.trade_details
      RETURNING id
    `
    return result.id
  }

  /**
   * Insert or update an intra-market opportunity
   */
  async upsertIntraMarketOpportunity(
    opp: IntraMarketOpportunity,
    marketDbId: string
  ): Promise<string> {
    const tradeDetails = {
      yesPrice: opp.yesPrice,
      noPrice: opp.noPrice,
      spread: opp.spread,
    }

    const [result] = await this.sql`
      INSERT INTO arbitrage_opportunities (
        id, type, market_id, trade_details,
        profit_margin, required_capital, expected_profit,
        detected_at, status
      ) VALUES (
        ${opp.id}, 'intra-market', ${marketDbId},
        ${JSON.stringify(tradeDetails)}, ${opp.profitMargin}, 100,
        ${opp.profitMargin}, ${opp.detectedAt}, 'active'
      )
      ON CONFLICT (id) DO UPDATE SET
        profit_margin = EXCLUDED.profit_margin,
        trade_details = EXCLUDED.trade_details
      RETURNING id
    `
    return result.id
  }

  /**
   * Get active opportunities
   */
  async getActiveOpportunities(
    type?: "cross-market" | "intra-market"
  ): Promise<DbOpportunity[]> {
    if (type) {
      return this.sql<DbOpportunity[]>`
        SELECT * FROM arbitrage_opportunities
        WHERE status = 'active' AND type = ${type}
        ORDER BY profit_margin DESC
      `
    }
    return this.sql<DbOpportunity[]>`
      SELECT * FROM arbitrage_opportunities
      WHERE status = 'active'
      ORDER BY profit_margin DESC
    `
  }

  /**
   * Get opportunity by ID
   */
  async getOpportunityById(id: string): Promise<DbOpportunity | null> {
    const [opp] = await this.sql<DbOpportunity[]>`
      SELECT * FROM arbitrage_opportunities WHERE id = ${id}
    `
    return opp ?? null
  }

  /**
   * Mark opportunity as expired
   */
  async markExpired(id: string): Promise<void> {
    await this.sql`
      UPDATE arbitrage_opportunities
      SET status = 'expired', closed_at = NOW()
      WHERE id = ${id}
    `
  }

  /**
   * Mark opportunity as executed
   */
  async markExecuted(id: string): Promise<void> {
    await this.sql`
      UPDATE arbitrage_opportunities
      SET status = 'executed', closed_at = NOW()
      WHERE id = ${id}
    `
  }

  /**
   * Expire old active opportunities (cleanup job)
   */
  async expireOldOpportunities(maxAgeMinutes = 30): Promise<number> {
    const result = await this.sql`
      UPDATE arbitrage_opportunities
      SET status = 'expired', closed_at = NOW()
      WHERE status = 'active'
        AND detected_at < NOW() - ${maxAgeMinutes + ' minutes'}::interval
    `
    return result.count
  }

  /**
   * Insert opportunity snapshot (for tracking profit over time)
   */
  async insertOpportunitySnapshot(
    opportunityId: string,
    profitMargin: number,
    prices: {
      kalshiYes?: number
      kalshiNo?: number
      polymarketYes?: number
      polymarketNo?: number
      marketYes?: number
      marketNo?: number
      spread?: number
    }
  ): Promise<void> {
    await this.sql`
      INSERT INTO opportunity_snapshots (
        time, opportunity_id, profit_margin,
        kalshi_yes_price, kalshi_no_price,
        polymarket_yes_price, polymarket_no_price,
        market_yes_price, market_no_price, spread
      ) VALUES (
        NOW(), ${opportunityId}, ${profitMargin},
        ${prices.kalshiYes ?? null}, ${prices.kalshiNo ?? null},
        ${prices.polymarketYes ?? null}, ${prices.polymarketNo ?? null},
        ${prices.marketYes ?? null}, ${prices.marketNo ?? null},
        ${prices.spread ?? null}
      )
    `
  }

  /**
   * Get historical opportunities with profit stats
   */
  async getOpportunityHistory(
    startTime: Date,
    endTime: Date = new Date(),
    limit = 100
  ): Promise<DbOpportunity[]> {
    return this.sql<DbOpportunity[]>`
      SELECT * FROM arbitrage_opportunities
      WHERE detected_at >= ${startTime} AND detected_at <= ${endTime}
      ORDER BY detected_at DESC
      LIMIT ${limit}
    `
  }

  /**
   * Get best historical opportunities
   */
  async getBestOpportunities(
    minProfit = 1.0,
    limit = 10
  ): Promise<DbOpportunity[]> {
    return this.sql<DbOpportunity[]>`
      SELECT * FROM arbitrage_opportunities
      WHERE profit_margin >= ${minProfit}
      ORDER BY profit_margin DESC
      LIMIT ${limit}
    `
  }

  // ============================================
  // Scan History
  // ============================================

  /**
   * Start a new scan (returns scan ID)
   */
  async startScan(): Promise<string> {
    const [result] = await this.sql`
      INSERT INTO scan_history (status) VALUES ('running')
      RETURNING id
    `
    return result.id
  }

  /**
   * Complete a scan with results
   */
  async completeScan(
    scanId: string,
    results: {
      kalshiCount: number
      polymarketCount: number
      crossOpportunities: number
      intraOpportunities: number
    }
  ): Promise<void> {
    await this.sql`
      UPDATE scan_history SET
        completed_at = NOW(),
        kalshi_markets_count = ${results.kalshiCount},
        polymarket_markets_count = ${results.polymarketCount},
        cross_opportunities_found = ${results.crossOpportunities},
        intra_opportunities_found = ${results.intraOpportunities},
        duration_ms = EXTRACT(MILLISECOND FROM (NOW() - started_at))::integer,
        status = 'completed'
      WHERE id = ${scanId}
    `
  }

  /**
   * Fail a scan with error
   */
  async failScan(scanId: string, errorMessage: string): Promise<void> {
    await this.sql`
      UPDATE scan_history SET
        completed_at = NOW(),
        error_message = ${errorMessage},
        duration_ms = EXTRACT(MILLISECOND FROM (NOW() - started_at))::integer,
        status = 'failed'
      WHERE id = ${scanId}
    `
  }

  /**
   * Get recent scans
   */
  async getRecentScans(limit = 10): Promise<DbScanHistory[]> {
    return this.sql<DbScanHistory[]>`
      SELECT * FROM scan_history
      ORDER BY started_at DESC
      LIMIT ${limit}
    `
  }

  /**
   * Get scan statistics for a time period
   */
  async getScanStats(startTime: Date, endTime: Date = new Date()) {
    const [result] = await this.sql`
      SELECT
        COUNT(*)::integer AS total_scans,
        COUNT(*) FILTER (WHERE status = 'completed')::integer AS completed_scans,
        COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed_scans,
        AVG(duration_ms)::integer AS avg_duration_ms,
        SUM(cross_opportunities_found)::integer AS total_cross_opportunities,
        SUM(intra_opportunities_found)::integer AS total_intra_opportunities
      FROM scan_history
      WHERE started_at >= ${startTime} AND started_at <= ${endTime}
    `
    return result
  }
}

export const opportunitiesRepository = new OpportunitiesRepository()
