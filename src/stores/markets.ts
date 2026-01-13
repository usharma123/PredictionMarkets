import { createEffect, createMemo, createSignal } from "solid-js"
import type { Market } from "../models/market"
import { domeClient } from "../api/dome"
import { calculateSimilarity, keywordOverlap, normalizeTitle } from "../utils/fuzzy"
import {
  isDatabaseAvailable,
  marketsRepository,
  snapshotsRepository,
  cacheManager,
  type DataSource,
} from "../db"

export interface MarketsState {
  kalshi: Market[]
  polymarket: Market[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

const [kalshiMarkets, setKalshiMarkets] = createSignal<Market[]>([])
const [polymarketMarkets, setPolymarketMarkets] = createSignal<Market[]>([])
const [loading, setLoading] = createSignal(false)
const [error, setError] = createSignal<string | null>(null)
const [lastUpdated, setLastUpdated] = createSignal<Date | null>(null)

const [kalshiConnected, setKalshiConnected] = createSignal(false)
const [polymarketConnected, setPolymarketConnected] = createSignal(false)
const [domeConnected, setDomeConnected] = createSignal(false)
const [dbConnected, setDbConnected] = createSignal(false)
const [dataSource, setDataSource] = createSignal<DataSource>("api")

export interface MarketSearchResult {
  key: string
  market: Market
  score: number
}

const [marketSearchQuery, setMarketSearchQuery] = createSignal("")
const [selectedSearchMarketKey, setSelectedSearchMarketKey] = createSignal<string | null>(null)

const MAX_SEARCH_RESULTS = 50
const MIN_SEARCH_SCORE = 0.4

function getMarketSearchKey(market: Market): string {
  return `${market.platform}:${market.id}`
}

function scoreMarketMatch(query: string, market: Market): number {
  const candidates = [
    market.title,
    market.ticker,
    market.domeMarketSlug,
    market.domeMarketTicker,
  ].filter((value): value is string => Boolean(value))

  const normalizedQuery = normalizeTitle(query)
  if (!normalizedQuery) return 0

  let bestScore = 0

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeTitle(candidate)
    if (!normalizedCandidate) continue

    let score = Math.max(
      calculateSimilarity(query, candidate),
      keywordOverlap(query, candidate)
    )

    if (normalizedCandidate.includes(normalizedQuery)) {
      score = Math.max(score, 0.9)
    }

    if (score > bestScore) {
      bestScore = score
    }
  }

  return bestScore
}

export const marketSearchResults = createMemo<MarketSearchResult[]>(() => {
  const query = marketSearchQuery().trim()
  if (!query || query.length < 2) return []

  const allMarkets = [...kalshiMarkets(), ...polymarketMarkets()]
  const results = allMarkets
    .map((market) => ({
      key: getMarketSearchKey(market),
      market,
      score: scoreMarketMatch(query, market),
    }))
    .filter((result) => result.score >= MIN_SEARCH_SCORE)
    .sort((a, b) => b.score - a.score)

  return results.slice(0, MAX_SEARCH_RESULTS)
})

export const selectedSearchMarket = createMemo<Market | null>(() => {
  const key = selectedSearchMarketKey()
  if (!key) return null

  const result = marketSearchResults().find((entry) => entry.key === key)
  return result?.market ?? null
})

createEffect(() => {
  const query = marketSearchQuery().trim()
  if (!query || query.length < 2) {
    setSelectedSearchMarketKey(null)
    return
  }

  const results = marketSearchResults()
  if (results.length === 0) {
    setSelectedSearchMarketKey(null)
    return
  }

  const currentKey = selectedSearchMarketKey()
  const stillValid = results.some((result) => result.key === currentKey)
  if (!stillValid) {
    setSelectedSearchMarketKey(results[0].key)
  }
})

// ============================================
// Database Persistence Helpers
// ============================================

/**
 * Persist markets to database (non-blocking)
 * This writes market metadata and price snapshots
 */
async function persistMarketsToDb(
  markets: Market[],
  platform: "kalshi" | "polymarket"
): Promise<void> {
  try {
    // Check DB availability
    const dbAvailable = await isDatabaseAvailable()
    if (!dbAvailable) {
      setDbConnected(false)
      return
    }
    setDbConnected(true)

    // Upsert markets and get DB IDs
    const idMap = await marketsRepository.upsertMarkets(markets)

    // Insert price snapshots
    const snapshots = markets
      .filter((market) => idMap.has(market.id))
      .map((market) => ({
        marketDbId: idMap.get(market.id)!,
        market,
      }))

    if (snapshots.length > 0) {
      await snapshotsRepository.insertSnapshots(snapshots, "api")
    }

    // Update cache
    cacheManager.setCachedMarkets(platform, markets)
  } catch (err) {
    console.warn(`Failed to persist ${platform} markets to DB:`, err)
    // Don't throw - DB failure shouldn't break the app
  }
}

/**
 * Load markets from database (fallback when API fails)
 */
async function loadMarketsFromDb(
  platform: "kalshi" | "polymarket"
): Promise<Market[]> {
  try {
    const dbAvailable = await isDatabaseAvailable()
    if (!dbAvailable) return []

    const markets = await marketsRepository.getMarketsWithLatestSnapshot(platform)
    return markets
  } catch (err) {
    console.warn(`Failed to load ${platform} markets from DB:`, err)
    return []
  }
}

/**
 * Check if we have cached data that's still fresh
 */
function getCachedMarketsIfFresh(platform: string): Market[] | null {
  return cacheManager.getCachedMarkets(platform)
}

// ============================================
// API Fetch Functions
// ============================================

export async function fetchKalshiMarkets(): Promise<Market[]> {
  try {
    const markets = await domeClient.getAllKalshiMarkets("open")
    setKalshiMarkets(markets)
    setKalshiConnected(true)
    setDomeConnected(true)
    // Persist to DB in background
    persistMarketsToDb(markets, "kalshi")
    return markets
  } catch (err) {
    setKalshiConnected(false)
    throw err
  }
}

export async function fetchPolymarketMarkets(): Promise<Market[]> {
  try {
    const markets = await domeClient.getAllPolymarketMarkets("open")
    setPolymarketMarkets(markets)
    setPolymarketConnected(true)
    setDomeConnected(true)
    // Persist to DB in background
    persistMarketsToDb(markets, "polymarket")
    return markets
  } catch (err) {
    setPolymarketConnected(false)
    throw err
  }
}

export async function fetchAllMarkets(forceRefresh = false): Promise<void> {
  if (loading()) return
  setLoading(true)
  setError(null)

  try {
    let hasSuccess = false
    let errorMessage: string | null = null

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cachedKalshi = getCachedMarketsIfFresh("kalshi")
      const cachedPoly = getCachedMarketsIfFresh("polymarket")

      if (cachedKalshi && cachedPoly) {
        setKalshiMarkets(cachedKalshi)
        setPolymarketMarkets(cachedPoly)
        setKalshiConnected(true)
        setPolymarketConnected(true)
        setDataSource("cache")
        setLastUpdated(new Date())
        setLoading(false)
        return
      }
    }

    // Fetch sequentially to respect rate limits (1 req/sec on free tier)
    try {
      const markets = await domeClient.getAllKalshiMarkets("open")
      setKalshiMarkets(markets)
      setKalshiConnected(true)
      setDataSource("api")
      hasSuccess = true
      // Persist in background
      persistMarketsToDb(markets, "kalshi")
    } catch (err) {
      setKalshiConnected(false)
      errorMessage = err instanceof Error ? err.message : "Failed to fetch Kalshi markets"
      // Fallback to DB
      const dbMarkets = await loadMarketsFromDb("kalshi")
      if (dbMarkets.length > 0) {
        setKalshiMarkets(dbMarkets)
        setDataSource("db")
        hasSuccess = true
      }
    }

    // Wait before fetching next platform to respect rate limit
    await new Promise((resolve) => setTimeout(resolve, 1100))

    try {
      const markets = await domeClient.getAllPolymarketMarkets("open")
      setPolymarketMarkets(markets)
      setPolymarketConnected(true)
      setDataSource("api")
      hasSuccess = true
      // Persist in background
      persistMarketsToDb(markets, "polymarket")
    } catch (err) {
      setPolymarketConnected(false)
      errorMessage = err instanceof Error ? err.message : "Failed to fetch Polymarket markets"
      // Fallback to DB
      const dbMarkets = await loadMarketsFromDb("polymarket")
      if (dbMarkets.length > 0) {
        setPolymarketMarkets(dbMarkets)
        setDataSource("db")
        hasSuccess = true
      }
    }

    if (hasSuccess) {
      setDomeConnected(true)
      setLastUpdated(new Date())
    } else {
      setError(errorMessage ?? "Failed to fetch markets")
      setDomeConnected(false)
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to fetch markets")
    setDomeConnected(false)
  } finally {
    setLoading(false)
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

export function startAutoRefresh(intervalMs: number = 30000): void {
  stopAutoRefresh()
  fetchAllMarkets()
  refreshInterval = setInterval(fetchAllMarkets, intervalMs)
}

export function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

export function useMarkets() {
  return {
    kalshi: kalshiMarkets,
    polymarket: polymarketMarkets,
    loading,
    error,
    lastUpdated,
    kalshiConnected,
    polymarketConnected,
    domeConnected,
    dbConnected,
    dataSource,
    marketSearchQuery,
    marketSearchResults,
    selectedSearchMarket,
    selectedSearchMarketKey,
    setMarketSearchQuery,
    setSelectedSearchMarketKey,
    refresh: fetchAllMarkets,
    startAutoRefresh,
    stopAutoRefresh,
  }
}

export {
  kalshiMarkets,
  polymarketMarkets,
  loading as marketsLoading,
  error as marketsError,
  lastUpdated as marketsLastUpdated,
  kalshiConnected,
  polymarketConnected,
  domeConnected,
  dbConnected,
  dataSource,
  marketSearchQuery,
  selectedSearchMarketKey,
  setMarketSearchQuery,
  setSelectedSearchMarketKey,
}
