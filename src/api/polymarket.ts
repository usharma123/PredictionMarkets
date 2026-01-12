import type { Market } from "../models/market"
import type { ApiConfig, RawPolymarketMarket, Orderbook, OrderbookLevel } from "./types"

const DEFAULT_BASE_URL = "https://clob.polymarket.com"
const GAMMA_API_URL = "https://gamma-api.polymarket.com"

export class PolymarketClient {
  private config: ApiConfig

  constructor(config?: Partial<ApiConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config?.apiKey ?? process.env.POLYMARKET_API_KEY,
      timeout: config?.timeout ?? 10000,
    }
  }

  private async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`
    }

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
      signal: AbortSignal.timeout(this.config.timeout ?? 10000),
    })

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getMarkets(params?: {
    limit?: number
    offset?: number
    active?: boolean
  }): Promise<{ markets: Market[]; hasMore: boolean }> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.offset) searchParams.set("offset", params.offset.toString())
    if (params?.active !== undefined) searchParams.set("active", params.active.toString())

    const query = searchParams.toString()
    const url = `${GAMMA_API_URL}/markets${query ? `?${query}` : ""}`

    const response = await this.fetch<RawPolymarketMarket[]>(url)

    return {
      markets: response.map((m) => this.transformMarket(m)),
      hasMore: response.length === (params?.limit ?? 100),
    }
  }

  async getMarket(conditionId: string): Promise<Market> {
    const url = `${GAMMA_API_URL}/markets/${conditionId}`
    const response = await this.fetch<RawPolymarketMarket>(url)
    return this.transformMarket(response)
  }

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    const url = `${this.config.baseUrl}/book?token_id=${tokenId}`
    const response = await this.fetch<{
      bids: Array<{ price: string; size: string }>
      asks: Array<{ price: string; size: string }>
    }>(url)

    const transformLevels = (
      levels: Array<{ price: string; size: string }>
    ): OrderbookLevel[] =>
      levels.map((l) => ({
        price: parseFloat(l.price),
        quantity: parseFloat(l.size),
      }))

    return {
      yes: {
        bids: transformLevels(response.bids),
        asks: transformLevels(response.asks),
      },
      no: {
        bids: [],
        asks: [],
      },
    }
  }

  async getPrices(tokenIds: string[]): Promise<Map<string, number>> {
    const url = `${this.config.baseUrl}/prices?token_ids=${tokenIds.join(",")}`
    const response = await this.fetch<Record<string, string>>(url)

    const prices = new Map<string, number>()
    for (const [tokenId, price] of Object.entries(response)) {
      prices.set(tokenId, parseFloat(price))
    }
    return prices
  }

  async getAllActiveMarkets(): Promise<Market[]> {
    const allMarkets: Market[] = []
    let offset = 0
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const response = await this.getMarkets({ limit, offset, active: true })
      allMarkets.push(...response.markets)
      hasMore = response.hasMore
      offset += limit
    }

    return allMarkets
  }

  private transformMarket(raw: RawPolymarketMarket): Market {
    const yesToken = raw.tokens?.find((t) => t.outcome === "Yes")
    const noToken = raw.tokens?.find((t) => t.outcome === "No")

    const yesPrice = yesToken?.price ?? 0.5
    const noPrice = noToken?.price ?? 0.5

    return {
      id: raw.condition_id,
      platform: "polymarket",
      ticker: raw.condition_id,
      title: raw.question,
      description: raw.description,
      category: raw.category,
      endDate: raw.end_date_iso ? new Date(raw.end_date_iso) : undefined,
      yesPrice,
      noPrice,
      volume: raw.volume,
      liquidity: raw.liquidity,
      lastUpdated: new Date(),
    }
  }

  isConfigured(): boolean {
    return true // Polymarket has public endpoints
  }
}

export const polymarketClient = new PolymarketClient()
