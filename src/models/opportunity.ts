import { z } from "zod"
import type { Market } from "./market"

export type ArbitrageType = "cross-market" | "intra-market"

export const ArbitrageOpportunitySchema = z.object({
  id: z.string(),
  type: z.enum(["cross-market", "intra-market"]),
  profitMargin: z.number(),
  requiredCapital: z.number(),
  expectedProfit: z.number(),
  confidence: z.number().min(0).max(1),
  detectedAt: z.date(),
  expiresAt: z.date().optional(),
})

export interface ArbitrageOpportunity {
  id: string
  type: ArbitrageType
  events: {
    kalshi?: Market
    polymarket?: Market
  }
  trade: {
    buy: {
      platform: "kalshi" | "polymarket"
      side: "yes" | "no"
      price: number
    }
    sell: {
      platform: "kalshi" | "polymarket"
      side: "yes" | "no"
      price: number
    }
  }
  profitMargin: number
  requiredCapital: number
  expectedProfit: number
  confidence: number
  detectedAt: Date
  expiresAt?: Date
}

export interface IntraMarketOpportunity {
  id: string
  type: "intra-market"
  market: Market
  yesPrice: number
  noPrice: number
  spread: number
  profitMargin: number
  detectedAt: Date
}
