import type { Market } from "../models/market"
import type { ApiConfig, RawKalshiMarket, Orderbook, OrderbookLevel } from "./types"

const DEFAULT_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"

export class KalshiClient {
  private config: ApiConfig

  constructor(config?: Partial<ApiConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config?.apiKey ?? process.env.KALSHI_API_KEY,
      apiSecret: config?.apiSecret ?? process.env.KALSHI_API_SECRET,
      timeout: config?.timeout ?? 10000,
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
      signal: AbortSignal.timeout(this.config.timeout ?? 10000),
    })

    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getMarkets(params?: {
    limit?: number
    cursor?: string
    status?: "open" | "closed" | "settled"
    eventTicker?: string
  }): Promise<{ markets: Market[]; cursor?: string }> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.cursor) searchParams.set("cursor", params.cursor)
    if (params?.status) searchParams.set("status", params.status)
    if (params?.eventTicker) searchParams.set("event_ticker", params.eventTicker)

    const query = searchParams.toString()
    const endpoint = `/markets${query ? `?${query}` : ""}`

    const response = await this.fetch<{
      markets: RawKalshiMarket[]
      cursor?: string
    }>(endpoint)

    return {
      markets: response.markets.map((m) => this.transformMarket(m)),
      cursor: response.cursor,
    }
  }

  async getMarket(ticker: string): Promise<Market> {
    const response = await this.fetch<{ market: RawKalshiMarket }>(`/markets/${ticker}`)
    return this.transformMarket(response.market)
  }

  async getOrderbook(ticker: string): Promise<Orderbook> {
    const response = await this.fetch<{
      orderbook: {
        yes: Array<[number, number]>
        no: Array<[number, number]>
      }
    }>(`/markets/${ticker}/orderbook`)

    const transformLevels = (levels: Array<[number, number]>): OrderbookLevel[] =>
      levels.map(([price, quantity]) => ({ price: price / 100, quantity }))

    return {
      yes: {
        bids: transformLevels(response.orderbook.yes.filter(([p]) => p > 0)),
        asks: transformLevels(response.orderbook.yes.filter(([p]) => p > 0)),
      },
      no: {
        bids: transformLevels(response.orderbook.no.filter(([p]) => p > 0)),
        asks: transformLevels(response.orderbook.no.filter(([p]) => p > 0)),
      },
    }
  }

  async getAllOpenMarkets(): Promise<Market[]> {
    const allMarkets: Market[] = []
    let cursor: string | undefined

    do {
      const response = await this.getMarkets({ limit: 100, cursor, status: "open" })
      allMarkets.push(...response.markets)
      cursor = response.cursor
    } while (cursor)

    return allMarkets
  }

  private transformMarket(raw: RawKalshiMarket): Market {
    const yesBid = raw.yes_bid / 100
    const yesAsk = raw.yes_ask / 100
    const noBid = raw.no_bid / 100
    const noAsk = raw.no_ask / 100

    return {
      id: raw.ticker,
      platform: "kalshi",
      ticker: raw.ticker,
      title: raw.title,
      description: raw.subtitle,
      category: raw.category,
      endDate: raw.close_time ? new Date(raw.close_time) : undefined,
      yesPrice: (yesBid + yesAsk) / 2,
      noPrice: (noBid + noAsk) / 2,
      yesBid,
      yesAsk,
      noBid,
      noAsk,
      volume: raw.volume_24h,
      liquidity: raw.open_interest,
      lastUpdated: new Date(),
    }
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey)
  }
}

export const kalshiClient = new KalshiClient()
