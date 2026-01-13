import { BaseRepository } from "./base"
import type { Market } from "../../models/market"
import type { DbMarket, DbMarketWithSnapshot } from "../types"
import { getPlatformId, dbMarketToModel } from "../types"

export class MarketsRepository extends BaseRepository {
  /**
   * Upsert a single market (insert or update on conflict)
   */
  async upsertMarket(market: Market): Promise<string> {
    const platformId = getPlatformId(market.platform)

    const [result] = await this.sql`
      INSERT INTO markets (
        platform_id, external_id, ticker, title, description, category,
        status, end_date, dome_market_slug, dome_condition_id,
        dome_market_ticker, dome_event_ticker,
        dome_side_a_id, dome_side_a_label, dome_side_b_id, dome_side_b_label,
        updated_at
      ) VALUES (
        ${platformId}, ${market.id}, ${market.ticker}, ${market.title},
        ${market.description ?? null}, ${market.category ?? null},
        'open', ${market.endDate ?? null},
        ${market.domeMarketSlug ?? null}, ${market.domeConditionId ?? null},
        ${market.domeMarketTicker ?? null}, ${market.domeEventTicker ?? null},
        ${market.domeSideA?.id ?? null}, ${market.domeSideA?.label ?? null},
        ${market.domeSideB?.id ?? null}, ${market.domeSideB?.label ?? null},
        NOW()
      )
      ON CONFLICT (platform_id, external_id) DO UPDATE SET
        ticker = EXCLUDED.ticker,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        end_date = EXCLUDED.end_date,
        dome_market_slug = EXCLUDED.dome_market_slug,
        dome_condition_id = EXCLUDED.dome_condition_id,
        dome_market_ticker = EXCLUDED.dome_market_ticker,
        dome_event_ticker = EXCLUDED.dome_event_ticker,
        dome_side_a_id = EXCLUDED.dome_side_a_id,
        dome_side_a_label = EXCLUDED.dome_side_a_label,
        dome_side_b_id = EXCLUDED.dome_side_b_id,
        dome_side_b_label = EXCLUDED.dome_side_b_label,
        updated_at = NOW()
      RETURNING id
    `
    return result.id
  }

  /**
   * Bulk upsert markets (returns map of external_id -> db_id)
   */
  async upsertMarkets(markets: Market[]): Promise<Map<string, string>> {
    const idMap = new Map<string, string>()
    if (markets.length === 0) return idMap

    await this.transaction(async (tx) => {
      for (const market of markets) {
        const platformId = getPlatformId(market.platform)
        const [result] = await tx`
          INSERT INTO markets (
            platform_id, external_id, ticker, title, description, category,
            status, end_date, dome_market_slug, dome_condition_id,
            dome_market_ticker, dome_event_ticker,
            dome_side_a_id, dome_side_a_label, dome_side_b_id, dome_side_b_label,
            updated_at
          ) VALUES (
            ${platformId}, ${market.id}, ${market.ticker}, ${market.title},
            ${market.description ?? null}, ${market.category ?? null},
            'open', ${market.endDate ?? null},
            ${market.domeMarketSlug ?? null}, ${market.domeConditionId ?? null},
            ${market.domeMarketTicker ?? null}, ${market.domeEventTicker ?? null},
            ${market.domeSideA?.id ?? null}, ${market.domeSideA?.label ?? null},
            ${market.domeSideB?.id ?? null}, ${market.domeSideB?.label ?? null},
            NOW()
          )
          ON CONFLICT (platform_id, external_id) DO UPDATE SET
            ticker = EXCLUDED.ticker,
            title = EXCLUDED.title,
            updated_at = NOW()
          RETURNING id
        `
        idMap.set(market.id, result.id)
      }
    })

    return idMap
  }

  /**
   * Get market by platform and external ID
   */
  async getMarketByExternalId(
    platform: "kalshi" | "polymarket",
    externalId: string
  ): Promise<DbMarket | null> {
    const platformId = getPlatformId(platform)
    const [market] = await this.sql<DbMarket[]>`
      SELECT * FROM markets
      WHERE platform_id = ${platformId} AND external_id = ${externalId}
    `
    return market ?? null
  }

  /**
   * Get all markets for a platform
   */
  async getMarketsByPlatform(
    platform: "kalshi" | "polymarket",
    status = "open"
  ): Promise<DbMarket[]> {
    const platformId = getPlatformId(platform)
    return this.sql<DbMarket[]>`
      SELECT * FROM markets
      WHERE platform_id = ${platformId} AND status = ${status}
      ORDER BY updated_at DESC
    `
  }

  /**
   * Get markets with their latest snapshot (joined query for efficiency)
   */
  async getMarketsWithLatestSnapshot(
    platform: "kalshi" | "polymarket"
  ): Promise<Market[]> {
    const platformId = getPlatformId(platform)

    const rows = await this.sql<DbMarketWithSnapshot[]>`
      SELECT
        m.*,
        s.time as snapshot_time,
        s.yes_price,
        s.no_price,
        s.yes_bid,
        s.yes_ask,
        s.no_bid,
        s.no_ask,
        s.volume,
        s.liquidity
      FROM markets m
      LEFT JOIN LATERAL (
        SELECT * FROM market_snapshots ms
        WHERE ms.market_id = m.id
        ORDER BY ms.time DESC
        LIMIT 1
      ) s ON true
      WHERE m.platform_id = ${platformId} AND m.status = 'open'
      ORDER BY m.updated_at DESC
    `

    return rows.map((row: DbMarketWithSnapshot) => dbMarketToModel(row))
  }

  /**
   * Get DB IDs for a list of external market IDs
   */
  async getDbIds(
    platform: "kalshi" | "polymarket",
    externalIds: string[]
  ): Promise<Map<string, string>> {
    const platformId = getPlatformId(platform)
    const idMap = new Map<string, string>()

    if (externalIds.length === 0) return idMap

    const rows = await this.sql<{ id: string; external_id: string }[]>`
      SELECT id, external_id FROM markets
      WHERE platform_id = ${platformId} AND external_id = ANY(${externalIds})
    `

    for (const row of rows) {
      idMap.set(row.external_id, row.id)
    }

    return idMap
  }

  /**
   * Update market status
   */
  async updateStatus(dbId: string, status: string): Promise<void> {
    await this.sql`
      UPDATE markets SET status = ${status}, updated_at = NOW()
      WHERE id = ${dbId}
    `
  }
}

export const marketsRepository = new MarketsRepository()
