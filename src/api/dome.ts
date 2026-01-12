import type { Market } from "../models/market"
import type {
  DomeConfig,
  DomePolymarketMarket,
  DomeKalshiMarket,
  DomeMatchingMarketsResponse,
  DomeMarketPrice,
  DomePagination,
} from "./types"

const DEFAULT_BASE_URL = "https://api.domeapi.io/v1"

export class DomeClient {
  private config: DomeConfig

  constructor(config?: Partial<DomeConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config?.apiKey ?? process.env.DOME_API_KEY ?? "",
      timeout: config?.timeout ?? 15000,
    }
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`
    }

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
      signal: AbortSignal.timeout(this.config.timeout ?? 15000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(`Dome API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return response.json()
  }

  // ==================== Polymarket Endpoints ====================

  async getPolymarketMarkets(params?: {
    market_slug?: string[]
    event_slug?: string[]
    condition_id?: string[]
    tags?: string[]
    search?: string
    status?: "open" | "closed"
    min_volume?: number
    limit?: number
    offset?: number
    start_time?: number
    end_time?: number
  }): Promise<{ markets: DomePolymarketMarket[]; pagination: DomePagination }> {
    const searchParams = new URLSearchParams()

    if (params?.market_slug) params.market_slug.forEach((s) => searchParams.append("market_slug", s))
    if (params?.event_slug) params.event_slug.forEach((s) => searchParams.append("event_slug", s))
    if (params?.condition_id) params.condition_id.forEach((s) => searchParams.append("condition_id", s))
    if (params?.tags) params.tags.forEach((t) => searchParams.append("tags", t))
    if (params?.search) searchParams.set("search", params.search)
    if (params?.status) searchParams.set("status", params.status)
    if (params?.min_volume) searchParams.set("min_volume", params.min_volume.toString())
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.offset) searchParams.set("offset", params.offset.toString())
    if (params?.start_time) searchParams.set("start_time", params.start_time.toString())
    if (params?.end_time) searchParams.set("end_time", params.end_time.toString())

    const query = searchParams.toString()
    return this.fetch(`/polymarket/markets${query ? `?${query}` : ""}`)
  }

  async getPolymarketPrice(tokenId: string, atTime?: number): Promise<DomeMarketPrice> {
    const params = new URLSearchParams({ token_id: tokenId })
    if (atTime) params.set("at_time", atTime.toString())
    return this.fetch(`/polymarket/price?${params.toString()}`)
  }

  async getAllPolymarketMarkets(status: "open" | "closed" = "open"): Promise<Market[]> {
    const allMarkets: Market[] = []
    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const response = await this.getPolymarketMarkets({ limit, offset, status })
      allMarkets.push(...response.markets.map((m) => this.transformPolymarketMarket(m)))
      hasMore = response.pagination.has_more
      offset += limit
    }

    return allMarkets
  }

  // ==================== Kalshi Endpoints ====================

  async getKalshiMarkets(params?: {
    market_ticker?: string[]
    event_ticker?: string[]
    search?: string
    status?: "open" | "closed"
    min_volume?: number
    limit?: number
    offset?: number
  }): Promise<{ markets: DomeKalshiMarket[]; pagination: DomePagination }> {
    const searchParams = new URLSearchParams()

    if (params?.market_ticker) params.market_ticker.forEach((t) => searchParams.append("market_ticker", t))
    if (params?.event_ticker) params.event_ticker.forEach((t) => searchParams.append("event_ticker", t))
    if (params?.search) searchParams.set("search", params.search)
    if (params?.status) searchParams.set("status", params.status)
    if (params?.min_volume) searchParams.set("min_volume", params.min_volume.toString())
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.offset) searchParams.set("offset", params.offset.toString())

    const query = searchParams.toString()
    return this.fetch(`/kalshi/markets${query ? `?${query}` : ""}`)
  }

  async getAllKalshiMarkets(status: "open" | "closed" = "open"): Promise<Market[]> {
    const allMarkets: Market[] = []
    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const response = await this.getKalshiMarkets({ limit, offset, status })
      allMarkets.push(...response.markets.map((m) => this.transformKalshiMarket(m)))
      hasMore = response.pagination.has_more
      offset += limit
    }

    return allMarkets
  }

  // ==================== Matching Markets ====================

  async getMatchingMarkets(params: {
    polymarket_market_slug?: string[]
    kalshi_event_ticker?: string[]
  }): Promise<DomeMatchingMarketsResponse> {
    const searchParams = new URLSearchParams()

    if (params.polymarket_market_slug) {
      params.polymarket_market_slug.forEach((s) => searchParams.append("polymarket_market_slug", s))
    }
    if (params.kalshi_event_ticker) {
      params.kalshi_event_ticker.forEach((t) => searchParams.append("kalshi_event_ticker", t))
    }

    const query = searchParams.toString()
    return this.fetch(`/matching-markets/sports?${query}`)
  }

  async getMatchingMarketsBySport(params: {
    sport: "nfl" | "mlb" | "cfb" | "nba" | "nhl" | "cbb"
    date: string // YYYY-MM-DD
  }): Promise<DomeMatchingMarketsResponse> {
    return this.fetch(`/matching-markets/sports/${params.sport}?date=${params.date}`)
  }

  // ==================== Transformers ====================

  private transformPolymarketMarket(raw: DomePolymarketMarket): Market {
    // For Polymarket, we'll use default prices (actual prices need to be fetched separately)
    // The side labels tell us what each side represents
    const yesPrice = 0.5
    const noPrice = 0.5

    return {
      id: raw.condition_id,
      platform: "polymarket",
      ticker: raw.market_slug,
      title: raw.title,
      description: undefined,
      category: raw.tags?.[0],
      endDate: raw.end_time ? new Date(raw.end_time * 1000) : undefined,
      yesPrice,
      noPrice,
      volume: raw.volume_total,
      liquidity: undefined,
      lastUpdated: new Date(),
      // Dome-specific fields
      domeMarketSlug: raw.market_slug,
      domeConditionId: raw.condition_id,
      domeSideA: raw.side_a ?? undefined,
      domeSideB: raw.side_b ?? undefined,
    }
  }

  private transformKalshiMarket(raw: DomeKalshiMarket): Market {
    // Kalshi prices are in cents (0-100), convert to decimal (0-1)
    const yesPrice = raw.last_price / 100
    const noPrice = 1 - yesPrice

    return {
      id: raw.market_ticker,
      platform: "kalshi",
      ticker: raw.market_ticker,
      title: raw.title,
      description: undefined,
      category: undefined,
      endDate: raw.end_time ? new Date(raw.end_time * 1000) : undefined,
      yesPrice,
      noPrice,
      volume: raw.volume,
      liquidity: undefined,
      lastUpdated: new Date(),
      // Dome-specific fields
      domeMarketTicker: raw.market_ticker,
      domeEventTicker: raw.event_ticker,
    }
  }

  // ==================== Batch Price Fetching ====================

  async updatePolymarketPrices(markets: Market[]): Promise<Market[]> {
    const updatedMarkets = [...markets]

    // Fetch prices for each market's side tokens
    const pricePromises = markets
      .filter((m) => m.platform === "polymarket" && m.domeSideA?.id)
      .map(async (m, index) => {
        try {
          const sideAPrice = await this.getPolymarketPrice(m.domeSideA!.id)
          const yesPrice = sideAPrice.price
          const noPrice = 1 - yesPrice

          // Find and update the market
          const marketIndex = updatedMarkets.findIndex((um) => um.id === m.id)
          if (marketIndex !== -1) {
            updatedMarkets[marketIndex] = {
              ...updatedMarkets[marketIndex],
              yesPrice,
              noPrice,
              lastUpdated: new Date(),
            }
          }
        } catch (err) {
          // Silently fail for individual price fetches
          console.warn(`Failed to fetch price for ${m.id}:`, err)
        }
      })

    await Promise.allSettled(pricePromises)
    return updatedMarkets
  }

  // ==================== Combined Fetch (Both Platforms) ====================

  async getAllMarkets(): Promise<{ kalshi: Market[]; polymarket: Market[] }> {
    const [kalshi, polymarket] = await Promise.all([
      this.getAllKalshiMarkets("open"),
      this.getAllPolymarketMarkets("open"),
    ])

    return { kalshi, polymarket }
  }

  // ==================== Configuration ====================

  isConfigured(): boolean {
    return Boolean(this.config.apiKey)
  }

  getConfig(): DomeConfig {
    return { ...this.config }
  }
}

// Singleton instance
export const domeClient = new DomeClient()
