// ==================== Dome API Types ====================

export interface DomeConfig {
  apiKey: string
  baseUrl: string
  timeout?: number
}

export interface DomeMarketSide {
  id: string
  label: string
}

export interface DomePolymarketMarket {
  market_slug: string
  condition_id: string
  title: string
  start_time: number | null
  end_time: number | null
  completed_time: number | null
  close_time: number | null
  game_start_time: string | null
  tags: string[]
  volume_1_week: number
  volume_1_month: number
  volume_1_year: number
  volume_total: number
  resolution_source: string | null
  image: string | null
  side_a: DomeMarketSide | null
  side_b: DomeMarketSide | null
  winning_side: string | null
  status: "open" | "closed"
  extra_fields?: Record<string, unknown>
}

export interface DomeKalshiMarket {
  event_ticker: string
  market_ticker: string
  title: string
  start_time: number | null
  end_time: number | null
  close_time: number | null
  status: "open" | "closed"
  last_price: number
  volume: number
  volume_24h: number
  result: string | null
}

export interface DomeMarketPrice {
  price: number
  at_time: number
}

export interface DomePagination {
  limit: number
  offset: number
  total: number
  has_more: boolean
}

export interface DomeMatchingMarket {
  platform: "POLYMARKET" | "KALSHI"
  market_slug?: string
  token_ids?: string[]
  event_ticker?: string
  market_tickers?: string[]
}

export interface DomeMatchingMarketsResponse {
  markets: Record<string, DomeMatchingMarket[]>
}

export interface DomeOrderbookSnapshot {
  orderbook: {
    yes: Array<[number, number]>
    no: Array<[number, number]>
    yes_dollars: Array<[string, number]>
    no_dollars: Array<[string, number]>
  }
  timestamp: number
  ticker: string
}

export interface DomeTrade {
  trade_id: string
  market_ticker: string
  count: number
  yes_price: number
  no_price: number
  yes_price_dollars: number
  no_price_dollars: number
  taker_side: "yes" | "no"
  created_time: number
}
