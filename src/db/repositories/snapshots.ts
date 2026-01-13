import { BaseRepository } from "./base"
import type { Market } from "../../models/market"
import type { DbMarketSnapshot } from "../types"

export class SnapshotsRepository extends BaseRepository {
  /**
   * Insert a single snapshot
   */
  async insertSnapshot(
    marketDbId: string,
    market: Market,
    source = "api"
  ): Promise<void> {
    await this.sql`
      INSERT INTO market_snapshots (
        time, market_id, yes_price, no_price,
        yes_bid, yes_ask, no_bid, no_ask,
        volume, liquidity, source
      ) VALUES (
        NOW(), ${marketDbId}, ${market.yesPrice}, ${market.noPrice},
        ${market.yesBid ?? null}, ${market.yesAsk ?? null},
        ${market.noBid ?? null}, ${market.noAsk ?? null},
        ${market.volume ?? null}, ${market.liquidity ?? null},
        ${source}
      )
    `
  }

  /**
   * Bulk insert snapshots (more efficient for batch operations)
   */
  async insertSnapshots(
    snapshots: Array<{ marketDbId: string; market: Market }>,
    source = "api"
  ): Promise<void> {
    if (snapshots.length === 0) return

    const now = new Date()
    const values = snapshots.map(({ marketDbId, market }) => ({
      time: now,
      market_id: marketDbId,
      yes_price: market.yesPrice,
      no_price: market.noPrice,
      yes_bid: market.yesBid ?? null,
      yes_ask: market.yesAsk ?? null,
      no_bid: market.noBid ?? null,
      no_ask: market.noAsk ?? null,
      volume: market.volume ?? null,
      liquidity: market.liquidity ?? null,
      source,
    }))

    await this.sql`
      INSERT INTO market_snapshots ${this.sql(values)}
    `
  }

  /**
   * Get the latest snapshot for a market
   */
  async getLatestSnapshot(marketDbId: string): Promise<DbMarketSnapshot | null> {
    const [snapshot] = await this.sql<DbMarketSnapshot[]>`
      SELECT * FROM market_snapshots
      WHERE market_id = ${marketDbId}
      ORDER BY time DESC
      LIMIT 1
    `
    return snapshot ?? null
  }

  /**
   * Get snapshot history for a market within a time range
   */
  async getSnapshotHistory(
    marketDbId: string,
    startTime: Date,
    endTime: Date = new Date()
  ): Promise<DbMarketSnapshot[]> {
    return this.sql<DbMarketSnapshot[]>`
      SELECT * FROM market_snapshots
      WHERE market_id = ${marketDbId}
        AND time >= ${startTime}
        AND time <= ${endTime}
      ORDER BY time ASC
    `
  }

  /**
   * Get hourly aggregated prices for a market (uses time_bucket)
   */
  async getHourlyAggregates(
    marketDbId: string,
    startTime: Date,
    endTime: Date = new Date()
  ) {
    return this.sql`
      SELECT
        time_bucket('1 hour', time) AS bucket,
        AVG(yes_price)::numeric(6,5) AS avg_yes_price,
        AVG(no_price)::numeric(6,5) AS avg_no_price,
        MIN(yes_price)::numeric(6,5) AS min_yes_price,
        MAX(yes_price)::numeric(6,5) AS max_yes_price,
        AVG(volume)::numeric(18,2) AS avg_volume,
        COUNT(*)::integer AS sample_count
      FROM market_snapshots
      WHERE market_id = ${marketDbId}
        AND time >= ${startTime}
        AND time <= ${endTime}
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  /**
   * Get the most recent snapshots across all markets for a platform
   */
  async getLatestSnapshotsForPlatform(
    platformId: number,
    limit = 100
  ): Promise<DbMarketSnapshot[]> {
    return this.sql<DbMarketSnapshot[]>`
      SELECT DISTINCT ON (ms.market_id)
        ms.*
      FROM market_snapshots ms
      JOIN markets m ON ms.market_id = m.id
      WHERE m.platform_id = ${platformId}
      ORDER BY ms.market_id, ms.time DESC
      LIMIT ${limit}
    `
  }

  /**
   * Get snapshot count for a time range (useful for analytics)
   */
  async getSnapshotCount(
    startTime: Date,
    endTime: Date = new Date()
  ): Promise<number> {
    const [result] = await this.sql<{ count: number }[]>`
      SELECT COUNT(*)::integer as count
      FROM market_snapshots
      WHERE time >= ${startTime} AND time <= ${endTime}
    `
    return result?.count ?? 0
  }

  /**
   * Get price movement statistics for a market
   */
  async getPriceMovement(
    marketDbId: string,
    lookbackHours = 24
  ) {
    const [result] = await this.sql`
      WITH recent AS (
        SELECT yes_price, no_price, time
        FROM market_snapshots
        WHERE market_id = ${marketDbId}
          AND time >= NOW() - ${lookbackHours + ' hours'}::interval
        ORDER BY time DESC
      ),
      first_price AS (
        SELECT yes_price, no_price FROM recent ORDER BY time ASC LIMIT 1
      ),
      last_price AS (
        SELECT yes_price, no_price FROM recent ORDER BY time DESC LIMIT 1
      )
      SELECT
        (SELECT yes_price FROM last_price) - (SELECT yes_price FROM first_price) AS yes_change,
        (SELECT no_price FROM last_price) - (SELECT no_price FROM first_price) AS no_change,
        (SELECT yes_price FROM last_price) AS current_yes,
        (SELECT yes_price FROM first_price) AS initial_yes,
        (SELECT COUNT(*) FROM recent)::integer AS sample_count
    `
    return result
  }
}

export const snapshotsRepository = new SnapshotsRepository()
