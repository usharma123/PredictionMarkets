export interface ApiConfig {
  apiKey?: string
  apiSecret?: string
  baseUrl: string
  timeout?: number
}

export interface ApiResponse<T> {
  data: T
  error?: string
  status: number
}

export interface PaginatedResponse<T> {
  data: T[]
  cursor?: string
  hasMore: boolean
}

export interface RawKalshiMarket {
  ticker: string
  event_ticker: string
  title: string
  subtitle?: string
  category: string
  status: string
  yes_bid: number
  yes_ask: number
  no_bid: number
  no_ask: number
  last_price: number
  volume: number
  volume_24h: number
  open_interest: number
  close_time?: string
  expiration_time?: string
}

export interface RawPolymarketMarket {
  condition_id: string
  question_id: string
  tokens: Array<{
    token_id: string
    outcome: string
    price: number
  }>
  question: string
  description?: string
  category?: string
  end_date_iso?: string
  active: boolean
  closed: boolean
  volume: number
  liquidity: number
}

export interface OrderbookLevel {
  price: number
  quantity: number
}

export interface Orderbook {
  yes: {
    bids: OrderbookLevel[]
    asks: OrderbookLevel[]
  }
  no: {
    bids: OrderbookLevel[]
    asks: OrderbookLevel[]
  }
}
