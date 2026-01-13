import type { Market, Platform } from "../models/market"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"

// ============================================
// Database Row Types
// ============================================

export interface DbPlatform {
  id: number
  name: string
  display_name: string
  taker_fee: number
  maker_fee: number
  created_at: Date
}

export interface DbMarket {
  id: string
  platform_id: number
  external_id: string
  ticker: string
  title: string
  description: string | null
  category: string | null
  status: string
  end_date: Date | null
  dome_market_slug: string | null
  dome_condition_id: string | null
  dome_market_ticker: string | null
  dome_event_ticker: string | null
  dome_side_a_id: string | null
  dome_side_a_label: string | null
  dome_side_b_id: string | null
  dome_side_b_label: string | null
  created_at: Date
  updated_at: Date
}

export interface DbMarketSnapshot {
  time: Date
  market_id: string
  yes_price: number
  no_price: number
  yes_bid: number | null
  yes_ask: number | null
  no_bid: number | null
  no_ask: number | null
  volume: number | null
  liquidity: number | null
  source: string
}

export interface DbOpportunity {
  id: string
  type: "cross-market" | "intra-market"
  kalshi_market_id: string | null
  polymarket_market_id: string | null
  market_id: string | null
  trade_details: Record<string, unknown>
  profit_margin: number
  required_capital: number
  expected_profit: number
  confidence: number | null
  detected_at: Date
  expires_at: Date | null
  closed_at: Date | null
  status: string
}

export interface DbOpportunitySnapshot {
  time: Date
  opportunity_id: string
  profit_margin: number
  kalshi_yes_price: number | null
  kalshi_no_price: number | null
  polymarket_yes_price: number | null
  polymarket_no_price: number | null
  market_yes_price: number | null
  market_no_price: number | null
  spread: number | null
}

export interface DbExecution {
  id: string
  opportunity_id: string | null
  platform_id: number
  market_id: string
  side: "yes" | "no"
  action: "buy" | "sell"
  quantity: number
  price: number
  fees: number
  status: string
  external_order_id: string | null
  external_trade_id: string | null
  created_at: Date
  submitted_at: Date | null
  filled_at: Date | null
  fill_price: number | null
  fill_quantity: number | null
  actual_fees: number | null
}

export interface DbScanHistory {
  id: string
  started_at: Date
  completed_at: Date | null
  kalshi_markets_count: number | null
  polymarket_markets_count: number | null
  cross_opportunities_found: number | null
  intra_opportunities_found: number | null
  duration_ms: number | null
  error_message: string | null
  status: string
}

// ============================================
// Market with Latest Snapshot (joined query)
// ============================================

export interface DbMarketWithSnapshot extends DbMarket {
  snapshot_time: Date | null
  yes_price: number | null
  no_price: number | null
  yes_bid: number | null
  yes_ask: number | null
  no_bid: number | null
  no_ask: number | null
  volume: number | null
  liquidity: number | null
}

// ============================================
// Conversion Utilities
// ============================================

const PLATFORM_NAMES: Record<number, Platform> = {
  1: "kalshi",
  2: "polymarket",
}

const PLATFORM_IDS: Record<Platform, number> = {
  kalshi: 1,
  polymarket: 2,
}

export function getPlatformId(platform: Platform): number {
  return PLATFORM_IDS[platform]
}

export function getPlatformName(platformId: number): Platform {
  return PLATFORM_NAMES[platformId] ?? "kalshi"
}

export function dbMarketToModel(
  db: DbMarketWithSnapshot | DbMarket,
  snapshot?: DbMarketSnapshot
): Market {
  const platformName = getPlatformName(db.platform_id)

  // Use snapshot data if available (either from joined query or separate snapshot)
  const snapshotData =
    "snapshot_time" in db
      ? {
          yesPrice: db.yes_price ?? 0.5,
          noPrice: db.no_price ?? 0.5,
          yesBid: db.yes_bid ?? undefined,
          yesAsk: db.yes_ask ?? undefined,
          noBid: db.no_bid ?? undefined,
          noAsk: db.no_ask ?? undefined,
          volume: db.volume ?? undefined,
          liquidity: db.liquidity ?? undefined,
          lastUpdated: db.snapshot_time ?? db.updated_at,
        }
      : snapshot
        ? {
            yesPrice: snapshot.yes_price,
            noPrice: snapshot.no_price,
            yesBid: snapshot.yes_bid ?? undefined,
            yesAsk: snapshot.yes_ask ?? undefined,
            noBid: snapshot.no_bid ?? undefined,
            noAsk: snapshot.no_ask ?? undefined,
            volume: snapshot.volume ?? undefined,
            liquidity: snapshot.liquidity ?? undefined,
            lastUpdated: snapshot.time,
          }
        : {
            yesPrice: 0.5,
            noPrice: 0.5,
            yesBid: undefined,
            yesAsk: undefined,
            noBid: undefined,
            noAsk: undefined,
            volume: undefined,
            liquidity: undefined,
            lastUpdated: db.updated_at,
          }

  return {
    id: db.external_id,
    platform: platformName,
    ticker: db.ticker,
    title: db.title,
    description: db.description ?? undefined,
    category: db.category ?? undefined,
    endDate: db.end_date ?? undefined,
    ...snapshotData,
    domeMarketSlug: db.dome_market_slug ?? undefined,
    domeConditionId: db.dome_condition_id ?? undefined,
    domeMarketTicker: db.dome_market_ticker ?? undefined,
    domeEventTicker: db.dome_event_ticker ?? undefined,
    domeSideA:
      db.dome_side_a_id && db.dome_side_a_label
        ? { id: db.dome_side_a_id, label: db.dome_side_a_label }
        : undefined,
    domeSideB:
      db.dome_side_b_id && db.dome_side_b_label
        ? { id: db.dome_side_b_id, label: db.dome_side_b_label }
        : undefined,
  }
}

export function modelToDbMarket(market: Market): Omit<DbMarket, "id" | "created_at" | "updated_at"> {
  return {
    platform_id: getPlatformId(market.platform),
    external_id: market.id,
    ticker: market.ticker,
    title: market.title,
    description: market.description ?? null,
    category: market.category ?? null,
    status: "open",
    end_date: market.endDate ?? null,
    dome_market_slug: market.domeMarketSlug ?? null,
    dome_condition_id: market.domeConditionId ?? null,
    dome_market_ticker: market.domeMarketTicker ?? null,
    dome_event_ticker: market.domeEventTicker ?? null,
    dome_side_a_id: market.domeSideA?.id ?? null,
    dome_side_a_label: market.domeSideA?.label ?? null,
    dome_side_b_id: market.domeSideB?.id ?? null,
    dome_side_b_label: market.domeSideB?.label ?? null,
  }
}

export function modelToDbSnapshot(
  marketDbId: string,
  market: Market,
  source = "api"
): Omit<DbMarketSnapshot, "time"> {
  return {
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
  }
}

// ============================================
// Analytics Types
// ============================================

export interface DashboardStats {
  markets: {
    total: number
    kalshi: number
    polymarket: number
    active: number
  }
  opportunities: {
    active: number
    crossMarket: number
    intraMarket: number
    detected24h: number
    avgProfitMargin: number
    maxProfitMargin: number
  }
  snapshots: {
    last24h: number
    lastHour: number
  }
  scans: {
    last24h: number
    successful: number
    avgDurationMs: number
  }
}

export interface MarketPriceHistory {
  bucket: Date
  avg_yes_price: number
  avg_no_price: number
  min_yes_price: number
  max_yes_price: number
  min_no_price: number
  max_no_price: number
  avg_volume: number | null
  sample_count: number
}

export interface TopMarket {
  market_db_id: string
  external_id: string
  ticker: string
  title: string
  platform: string
  avg_volume?: number
  max_volume?: number
  volatility?: number
  price_range?: number
  snapshot_count?: number
  current_price: number
}

export interface OpportunityTrend {
  bucket: Date
  type: "cross-market" | "intra-market"
  opportunity_count: number
  avg_profit: number
  max_profit: number
  min_profit: number
}

export interface ProfitTimeSeries {
  bucket: Date
  avg_profit_margin: number
  min_profit_margin: number
  max_profit_margin: number
  avg_kalshi_yes: number | null
  avg_poly_yes: number | null
  sample_count: number
}

export interface PlatformComparison {
  ticker: string
  title: string
  kalshi_yes_price: number
  polymarket_yes_price: number
  price_difference: number
  comparison: "kalshi_higher" | "polymarket_higher" | "equal"
}

export interface HourlyStats {
  bucket: Date
  avg_yes_price: number
  avg_no_price: number
  min_yes_price: number
  max_yes_price: number
  avg_volume: number | null
  sample_count: number
}
