import { createEffect, createMemo, createSignal } from "solid-js"
import type { Market } from "../models/market"
import { domeClient } from "../api/dome"
import { calculateSimilarity, keywordOverlap, normalizeTitle } from "../utils/fuzzy"

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

export async function fetchKalshiMarkets(): Promise<Market[]> {
  try {
    const markets = await domeClient.getAllKalshiMarkets("open")
    setKalshiMarkets(markets)
    setKalshiConnected(true)
    setDomeConnected(true)
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
    return markets
  } catch (err) {
    setPolymarketConnected(false)
    throw err
  }
}

export async function fetchAllMarkets(): Promise<void> {
  if (loading()) return
  setLoading(true)
  setError(null)

  try {
    const [kalshiResult, polymarketResult] = await Promise.allSettled([
      domeClient.getAllKalshiMarkets("open"),
      domeClient.getAllPolymarketMarkets("open"),
    ])

    let hasSuccess = false
    let errorMessage: string | null = null

    if (kalshiResult.status === "fulfilled") {
      setKalshiMarkets(kalshiResult.value)
      setKalshiConnected(true)
      hasSuccess = true
    } else {
      setKalshiConnected(false)
      errorMessage = kalshiResult.reason instanceof Error
        ? kalshiResult.reason.message
        : "Failed to fetch Kalshi markets"
    }

    if (polymarketResult.status === "fulfilled") {
      setPolymarketMarkets(polymarketResult.value)
      setPolymarketConnected(true)
      hasSuccess = true
    } else {
      setPolymarketConnected(false)
      errorMessage = polymarketResult.reason instanceof Error
        ? polymarketResult.reason.message
        : "Failed to fetch Polymarket markets"
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
  marketSearchQuery,
  marketSearchResults,
  selectedSearchMarket,
  selectedSearchMarketKey,
  setMarketSearchQuery,
  setSelectedSearchMarketKey,
}
