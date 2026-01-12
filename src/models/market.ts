import { z } from "zod"

export type Platform = "kalshi" | "polymarket"

export const MarketSchema = z.object({
  id: z.string(),
  platform: z.enum(["kalshi", "polymarket"]),
  ticker: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  endDate: z.date().optional(),
  yesPrice: z.number().min(0).max(1),
  noPrice: z.number().min(0).max(1),
  yesBid: z.number().min(0).max(1).optional(),
  yesAsk: z.number().min(0).max(1).optional(),
  noBid: z.number().min(0).max(1).optional(),
  noAsk: z.number().min(0).max(1).optional(),
  volume: z.number().optional(),
  liquidity: z.number().optional(),
  lastUpdated: z.date(),
})

export type Market = z.infer<typeof MarketSchema>

export interface MarketPair {
  kalshi?: Market
  polymarket?: Market
  matchConfidence: number
  matchReason: string
}
