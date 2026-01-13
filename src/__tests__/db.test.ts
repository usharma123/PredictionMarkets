import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import {
  getConnection,
  closeConnection,
  healthCheck,
  isDatabaseAvailable,
} from "../db/connection"
import {
  marketsRepository,
  snapshotsRepository,
  opportunitiesRepository,
  analyticsRepository,
} from "../db/repositories"
import type { Market } from "../models/market"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"

// Helper to generate proper UUID
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Helper for small delays
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Test data factory
function createTestMarket(
  platform: "kalshi" | "polymarket",
  id: string,
  ticker: string
): Market {
  return {
    id,
    platform,
    ticker,
    title: `Test Market: ${ticker}`,
    description: `Test description for ${ticker}`,
    category: "test",
    yesPrice: 0.55 + Math.random() * 0.2,
    noPrice: 0.45 - Math.random() * 0.2,
    yesBid: 0.53,
    yesAsk: 0.57,
    noBid: 0.43,
    noAsk: 0.47,
    volume: Math.random() * 100000,
    liquidity: Math.random() * 50000,
    lastUpdated: new Date(),
  }
}

function createTestCrossOpportunity(
  kalshiMarket: Market,
  polyMarket: Market
): ArbitrageOpportunity {
  const profitMargin = Math.random() * 5 + 1
  return {
    id: generateUUID(), // Use proper UUID
    type: "cross-market",
    kalshiMarket,
    polymarketMarket: polyMarket,
    trade: {
      buy: { platform: "kalshi", side: "yes", price: kalshiMarket.yesPrice },
      sell: { platform: "polymarket", side: "no", price: polyMarket.noPrice },
    },
    profitMargin,
    requiredCapital: 100,
    expectedProfit: profitMargin,
    confidence: 0.85,
    detectedAt: new Date(),
  }
}

function createTestIntraOpportunity(market: Market): IntraMarketOpportunity {
  const spread = 1 - market.yesPrice - market.noPrice
  return {
    id: generateUUID(), // Use proper UUID
    type: "intra-market",
    market,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    spread,
    profitMargin: Math.abs(spread) * 100,
    detectedAt: new Date(),
  }
}

describe("Database Connection", () => {
  it("should connect to the database", async () => {
    const isAvailable = await isDatabaseAvailable()
    expect(isAvailable).toBe(true)
  })

  it("should pass health check", async () => {
    const isHealthy = await healthCheck()
    expect(isHealthy).toBe(true)
  })

  it("should verify TimescaleDB extension is enabled", async () => {
    const sql = getConnection()
    const [result] = await sql`
      SELECT extname FROM pg_extension WHERE extname = 'timescaledb'
    `
    expect(result?.extname).toBe("timescaledb")
  })
})

describe("Markets Repository", () => {
  const testMarkets: Market[] = []
  const dbIds: Map<string, string> = new Map()

  beforeAll(async () => {
    // Create test markets
    testMarkets.push(
      createTestMarket("kalshi", "test-kalshi-1", "TEST-K1"),
      createTestMarket("kalshi", "test-kalshi-2", "TEST-K2"),
      createTestMarket("polymarket", "test-poly-1", "TEST-P1"),
      createTestMarket("polymarket", "test-poly-2", "TEST-P2")
    )
  })

  afterAll(async () => {
    // Cleanup test data
    const sql = getConnection()
    for (const market of testMarkets) {
      await sql`
        DELETE FROM markets WHERE external_id = ${market.id}
      `
    }
  })

  it("should upsert a single market", async () => {
    const market = testMarkets[0]
    const dbId = await marketsRepository.upsertMarket(market)
    expect(dbId).toBeDefined()
    expect(typeof dbId).toBe("string")
    dbIds.set(market.id, dbId)
  })

  it("should upsert multiple markets", async () => {
    const result = await marketsRepository.upsertMarkets(testMarkets.slice(1))
    expect(result.size).toBe(3)
    for (const [extId, dbId] of result) {
      dbIds.set(extId, dbId)
    }
  })

  it("should get market by external ID", async () => {
    const market = await marketsRepository.getMarketByExternalId(
      "kalshi",
      "test-kalshi-1"
    )
    expect(market).toBeDefined()
    expect(market?.ticker).toBe("TEST-K1")
  })

  it("should get markets by platform", async () => {
    const kalshiMarkets = await marketsRepository.getMarketsByPlatform("kalshi")
    expect(kalshiMarkets.length).toBeGreaterThanOrEqual(2)
  })

  it("should get DB IDs for external IDs", async () => {
    const ids = await marketsRepository.getDbIds("kalshi", [
      "test-kalshi-1",
      "test-kalshi-2",
    ])
    expect(ids.size).toBe(2)
  })
})

describe("Snapshots Repository", () => {
  let testMarket: Market
  let marketDbId: string

  beforeAll(async () => {
    testMarket = createTestMarket("kalshi", "test-snapshot-market", "TEST-SNAP")
    marketDbId = await marketsRepository.upsertMarket(testMarket)
  })

  afterAll(async () => {
    const sql = getConnection()
    await sql`DELETE FROM market_snapshots WHERE market_id = ${marketDbId}`
    await sql`DELETE FROM markets WHERE id = ${marketDbId}`
  })

  it("should insert a single snapshot", async () => {
    await snapshotsRepository.insertSnapshot(marketDbId, testMarket)
    const latest = await snapshotsRepository.getLatestSnapshot(marketDbId)
    expect(latest).toBeDefined()
    // postgres returns numeric as string, convert it
    expect(Number(latest?.yes_price)).toBeCloseTo(testMarket.yesPrice, 4)
  })

  it("should insert multiple snapshots with delays", async () => {
    // Insert snapshots with small delays to avoid timestamp collisions
    for (let i = 0; i < 2; i++) {
      await sleep(10) // 10ms delay between inserts
      await snapshotsRepository.insertSnapshot(
        marketDbId,
        { ...testMarket, yesPrice: 0.6 + i * 0.02 } as Market
      )
    }

    const count = await snapshotsRepository.getSnapshotCount(
      new Date(Date.now() - 3600000),
      new Date()
    )
    expect(count).toBeGreaterThanOrEqual(3)
  })

  it("should get snapshot history", async () => {
    const history = await snapshotsRepository.getSnapshotHistory(
      marketDbId,
      new Date(Date.now() - 3600000),
      new Date()
    )
    expect(history.length).toBeGreaterThanOrEqual(3)
  })

  it("should get hourly aggregates", async () => {
    const aggregates = await snapshotsRepository.getHourlyAggregates(
      marketDbId,
      new Date(Date.now() - 86400000),
      new Date()
    )
    expect(aggregates.length).toBeGreaterThanOrEqual(1)
  })

  it("should get price movement", async () => {
    const movement = await snapshotsRepository.getPriceMovement(marketDbId, 24)
    expect(movement).toBeDefined()
  })
})

describe("Opportunities Repository", () => {
  let kalshiMarket: Market
  let polyMarket: Market
  let kalshiDbId: string
  let polyDbId: string
  let crossOppId: string
  let intraOppId: string

  beforeAll(async () => {
    kalshiMarket = createTestMarket("kalshi", "test-opp-kalshi", "OPP-K")
    polyMarket = createTestMarket("polymarket", "test-opp-poly", "OPP-P")

    kalshiDbId = await marketsRepository.upsertMarket(kalshiMarket)
    polyDbId = await marketsRepository.upsertMarket(polyMarket)
  })

  afterAll(async () => {
    const sql = getConnection()
    if (crossOppId) {
      await sql`DELETE FROM opportunity_snapshots WHERE opportunity_id = ${crossOppId}`
      await sql`DELETE FROM arbitrage_opportunities WHERE id = ${crossOppId}`
    }
    if (intraOppId) {
      await sql`DELETE FROM opportunity_snapshots WHERE opportunity_id = ${intraOppId}`
      await sql`DELETE FROM arbitrage_opportunities WHERE id = ${intraOppId}`
    }
    await sql`DELETE FROM market_snapshots WHERE market_id = ${kalshiDbId}`
    await sql`DELETE FROM market_snapshots WHERE market_id = ${polyDbId}`
    await sql`DELETE FROM markets WHERE id = ${kalshiDbId}`
    await sql`DELETE FROM markets WHERE id = ${polyDbId}`
  })

  it("should upsert cross-market opportunity", async () => {
    const opp = createTestCrossOpportunity(kalshiMarket, polyMarket)
    crossOppId = await opportunitiesRepository.upsertCrossMarketOpportunity(
      opp,
      kalshiDbId,
      polyDbId
    )
    expect(crossOppId).toBe(opp.id)
  })

  it("should upsert intra-market opportunity", async () => {
    const opp = createTestIntraOpportunity(kalshiMarket)
    intraOppId = await opportunitiesRepository.upsertIntraMarketOpportunity(
      opp,
      kalshiDbId
    )
    expect(intraOppId).toBe(opp.id)
  })

  it("should get active opportunities", async () => {
    const active = await opportunitiesRepository.getActiveOpportunities()
    expect(active.length).toBeGreaterThanOrEqual(2)
  })

  it("should get active opportunities by type", async () => {
    const crossActive = await opportunitiesRepository.getActiveOpportunities(
      "cross-market"
    )
    expect(crossActive.length).toBeGreaterThanOrEqual(1)

    const intraActive = await opportunitiesRepository.getActiveOpportunities(
      "intra-market"
    )
    expect(intraActive.length).toBeGreaterThanOrEqual(1)
  })

  it("should get opportunity by ID", async () => {
    const opp = await opportunitiesRepository.getOpportunityById(crossOppId)
    expect(opp).toBeDefined()
    expect(opp?.type).toBe("cross-market")
  })

  it("should insert opportunity snapshot", async () => {
    await opportunitiesRepository.insertOpportunitySnapshot(crossOppId, 2.5, {
      kalshiYes: 0.55,
      kalshiNo: 0.45,
      polymarketYes: 0.52,
      polymarketNo: 0.48,
    })

    // Verify snapshot was inserted
    const sql = getConnection()
    const [snapshot] = await sql`
      SELECT * FROM opportunity_snapshots WHERE opportunity_id = ${crossOppId}
    `
    expect(snapshot).toBeDefined()
  })

  it("should mark opportunity as expired", async () => {
    // Create a new opportunity to expire
    const opp = createTestIntraOpportunity(polyMarket)
    const id = await opportunitiesRepository.upsertIntraMarketOpportunity(
      opp,
      polyDbId
    )
    await opportunitiesRepository.markExpired(id)

    const expired = await opportunitiesRepository.getOpportunityById(id)
    expect(expired?.status).toBe("expired")

    // Cleanup
    const sql = getConnection()
    await sql`DELETE FROM arbitrage_opportunities WHERE id = ${id}`
  })

  it("should get opportunity history", async () => {
    const history = await opportunitiesRepository.getOpportunityHistory(
      new Date(Date.now() - 86400000),
      new Date()
    )
    expect(history.length).toBeGreaterThanOrEqual(2)
  })

  it("should get best opportunities", async () => {
    const best = await opportunitiesRepository.getBestOpportunities(0, 10)
    expect(best.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Scan History", () => {
  let scanId: string

  afterAll(async () => {
    if (scanId) {
      const sql = getConnection()
      await sql`DELETE FROM scan_history WHERE id = ${scanId}`
    }
  })

  it("should start a scan", async () => {
    scanId = await opportunitiesRepository.startScan()
    expect(scanId).toBeDefined()
    expect(typeof scanId).toBe("string")
  })

  it("should complete a scan", async () => {
    await opportunitiesRepository.completeScan(scanId, {
      kalshiCount: 100,
      polymarketCount: 150,
      crossOpportunities: 5,
      intraOpportunities: 3,
    })

    const scans = await opportunitiesRepository.getRecentScans(1)
    expect(scans[0]?.status).toBe("completed")
    expect(scans[0]?.kalshi_markets_count).toBe(100)
  })

  it("should get scan statistics", async () => {
    const stats = await opportunitiesRepository.getScanStats(
      new Date(Date.now() - 86400000),
      new Date()
    )
    expect(stats).toBeDefined()
    expect(stats.total_scans).toBeGreaterThanOrEqual(1)
  })
})

describe("Analytics Repository", () => {
  let testMarket: Market
  let marketDbId: string

  beforeAll(async () => {
    // Create a test market with snapshots for analytics
    testMarket = createTestMarket("kalshi", "test-analytics-market", "TEST-ANALYTICS")
    marketDbId = await marketsRepository.upsertMarket(testMarket)

    // Insert several snapshots for analytics with delays to avoid timestamp collisions
    for (let i = 0; i < 5; i++) {
      await sleep(15)
      await snapshotsRepository.insertSnapshot(marketDbId, {
        ...testMarket,
        yesPrice: 0.5 + Math.random() * 0.2,
        noPrice: 0.5 - Math.random() * 0.2,
        volume: Math.random() * 100000,
      } as Market)
    }
  })

  afterAll(async () => {
    const sql = getConnection()
    await sql`DELETE FROM market_snapshots WHERE market_id = ${marketDbId}`
    await sql`DELETE FROM markets WHERE id = ${marketDbId}`
  })

  it("should get dashboard statistics", async () => {
    const stats = await analyticsRepository.getDashboardStats()

    expect(stats.markets).toBeDefined()
    expect(stats.markets.total).toBeGreaterThanOrEqual(1)
    expect(stats.opportunities).toBeDefined()
    expect(stats.snapshots).toBeDefined()
    expect(stats.scans).toBeDefined()
  })

  it("should get market price history", async () => {
    const history = await analyticsRepository.getMarketPriceHistory(marketDbId, 24)
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].avg_yes_price).toBeDefined()
    expect(history[0].sample_count).toBeGreaterThanOrEqual(1)
  })

  it("should get opportunity trends", async () => {
    const trends = await analyticsRepository.getOpportunityTrends(24)
    // May be empty if no opportunities exist
    expect(Array.isArray(trends)).toBe(true)
  })

  it("should get best opportunities by period", async () => {
    const best24h = await analyticsRepository.getBestOpportunitiesByPeriod("24h", 5)
    expect(Array.isArray(best24h)).toBe(true)

    const best7d = await analyticsRepository.getBestOpportunitiesByPeriod("7d", 5)
    expect(Array.isArray(best7d)).toBe(true)
  })

  it("should get top markets by volume", async () => {
    const topMarkets = await analyticsRepository.getTopMarketsByVolume(5)
    expect(Array.isArray(topMarkets)).toBe(true)
  })

  it("should get live spread analysis", async () => {
    const spreadAnalysis = await analyticsRepository.getLiveSpreadAnalysis()
    expect(Array.isArray(spreadAnalysis)).toBe(true)
  })

  it("should get scan performance history", async () => {
    const performance = await analyticsRepository.getScanPerformanceHistory(24)
    expect(Array.isArray(performance)).toBe(true)
  })
})

describe("TimescaleDB Features", () => {
  it("should verify hypertables exist", async () => {
    const sql = getConnection()
    const hypertables = await sql`
      SELECT hypertable_name
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = 'public'
    `
    const names = hypertables.map((h: { hypertable_name: string }) => h.hypertable_name)
    expect(names).toContain("market_snapshots")
    expect(names).toContain("opportunity_snapshots")
  })

  it("should verify continuous aggregates exist", async () => {
    const sql = getConnection()
    const caggs = await sql`
      SELECT view_name
      FROM timescaledb_information.continuous_aggregates
    `
    const names = caggs.map((c: { view_name: string }) => c.view_name)
    expect(names).toContain("market_prices_hourly")
    expect(names).toContain("opportunities_daily")
  })

  it("should verify compression policies exist", async () => {
    const sql = getConnection()
    const policies = await sql`
      SELECT hypertable_name
      FROM timescaledb_information.compression_settings
    `
    const names = policies.map((p: { hypertable_name: string }) => p.hypertable_name)
    expect(names).toContain("market_snapshots")
    expect(names).toContain("opportunity_snapshots")
  })

  it("should execute time_bucket query successfully", async () => {
    const sql = getConnection()
    const result = await sql`
      SELECT
        time_bucket('1 hour', NOW()) AS bucket,
        COUNT(*)::integer AS count
      FROM market_snapshots
      WHERE time >= NOW() - INTERVAL '1 hour'
      GROUP BY bucket
    `
    expect(Array.isArray(result)).toBe(true)
  })
})

describe("Database Cleanup", () => {
  afterAll(async () => {
    // Clean up all test data and close connection
    const sql = getConnection()
    
    // Delete test markets (cascades to snapshots and opportunities)
    await sql`
      DELETE FROM markets WHERE ticker LIKE 'TEST-%' OR external_id LIKE 'test-%'
    `
    
    // Delete test scan history
    await sql`
      DELETE FROM scan_history WHERE kalshi_markets_count = 100 AND polymarket_markets_count = 150
    `

    // Close connection pool
    await closeConnection()
  })

  it("should close database connection gracefully", async () => {
    // This test just ensures cleanup runs
    expect(true).toBe(true)
  })
})
