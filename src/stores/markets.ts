import { createSignal } from "solid-js"
import type { Market } from "../models/market"
import { domeClient } from "../api/dome"

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
  setLoading(true)
  setError(null)

  try {
    // Use Dome's unified fetch for both platforms
    const { kalshi, polymarket } = await domeClient.getAllMarkets()
    setKalshiMarkets(kalshi)
    setPolymarketMarkets(polymarket)
    setKalshiConnected(true)
    setPolymarketConnected(true)
    setDomeConnected(true)
    setLastUpdated(new Date())
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
}
