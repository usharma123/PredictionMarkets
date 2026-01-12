import type { Market, MarketPair } from "../models/market"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"

export interface FeeStructure {
  kalshi: {
    takerFee: number
    makerFee: number
  }
  polymarket: {
    takerFee: number
    makerFee: number
  }
}

export const DEFAULT_FEES: FeeStructure = {
  kalshi: {
    takerFee: 0.07,
    makerFee: 0.0,
  },
  polymarket: {
    takerFee: 0.02,
    makerFee: 0.0,
  },
}

export function calculateCrossMarketArbitrage(
  pair: MarketPair,
  fees: FeeStructure = DEFAULT_FEES
): ArbitrageOpportunity | null {
  const { kalshi, polymarket } = pair

  if (!kalshi || !polymarket) return null

  // Strategy 1: Buy YES on Kalshi, Buy NO on Polymarket
  // Profit if: kalshi.yesAsk + polymarket.noAsk < 1 - fees
  const strategy1Cost =
    (kalshi.yesAsk ?? kalshi.yesPrice) + (polymarket.noPrice ?? 1 - polymarket.yesPrice)
  const strategy1Fees = fees.kalshi.takerFee + fees.polymarket.takerFee
  const strategy1Profit = 1 - strategy1Cost - strategy1Fees

  // Strategy 2: Buy NO on Kalshi, Buy YES on Polymarket
  // Profit if: kalshi.noAsk + polymarket.yesAsk < 1 - fees
  const strategy2Cost =
    (kalshi.noAsk ?? kalshi.noPrice) + (polymarket.yesPrice)
  const strategy2Fees = fees.kalshi.takerFee + fees.polymarket.takerFee
  const strategy2Profit = 1 - strategy2Cost - strategy2Fees

  let bestStrategy: 1 | 2 | null = null
  let profit = 0

  if (strategy1Profit > 0 && strategy1Profit >= strategy2Profit) {
    bestStrategy = 1
    profit = strategy1Profit
  } else if (strategy2Profit > 0) {
    bestStrategy = 2
    profit = strategy2Profit
  }

  if (!bestStrategy || profit <= 0.001) return null

  const requiredCapital = 100 // Base unit of $100

  return {
    id: `cross-${kalshi.id}-${polymarket.id}`,
    type: "cross-market",
    events: { kalshi, polymarket },
    trade:
      bestStrategy === 1
        ? {
            buy: {
              platform: "kalshi",
              side: "yes",
              price: kalshi.yesAsk ?? kalshi.yesPrice,
            },
            sell: {
              platform: "polymarket",
              side: "no",
              price: polymarket.noPrice ?? 1 - polymarket.yesPrice,
            },
          }
        : {
            buy: {
              platform: "kalshi",
              side: "no",
              price: kalshi.noAsk ?? kalshi.noPrice,
            },
            sell: {
              platform: "polymarket",
              side: "yes",
              price: polymarket.yesPrice,
            },
          },
    profitMargin: profit * 100,
    requiredCapital,
    expectedProfit: profit * requiredCapital,
    confidence: pair.matchConfidence,
    detectedAt: new Date(),
  }
}

export function calculateIntraMarketArbitrage(
  market: Market,
  fees: FeeStructure = DEFAULT_FEES
): IntraMarketOpportunity | null {
  const platformFees =
    market.platform === "kalshi" ? fees.kalshi : fees.polymarket

  // Intra-market arbitrage exists when YES + NO < 1 (minus fees)
  // This means buying both guarantees profit
  const yesCost = market.yesAsk ?? market.yesPrice
  const noCost = market.noAsk ?? market.noPrice
  const totalCost = yesCost + noCost
  const totalFees = platformFees.takerFee * 2

  const spread = 1 - totalCost - totalFees

  if (spread <= 0.001) return null

  return {
    id: `intra-${market.platform}-${market.id}`,
    type: "intra-market",
    market,
    yesPrice: yesCost,
    noPrice: noCost,
    spread,
    profitMargin: spread * 100,
    detectedAt: new Date(),
  }
}

export function calculateExpectedValue(
  price: number,
  probability: number,
  fees: number
): number {
  // EV = probability * (1 - price - fees) - (1 - probability) * price
  return probability * (1 - price - fees) - (1 - probability) * price
}

export function calculateKellyBet(
  bankroll: number,
  probability: number,
  price: number
): number {
  // Kelly Criterion: f* = (bp - q) / b
  // where b = odds, p = probability of winning, q = 1 - p
  if (probability <= price) return 0

  const odds = (1 - price) / price
  const kelly = (odds * probability - (1 - probability)) / odds

  // Use half-Kelly for safety
  const halfKelly = kelly / 2

  return Math.max(0, Math.min(halfKelly, 0.25)) * bankroll
}

export function sortByProfitMargin<T extends { profitMargin: number }>(
  opportunities: T[]
): T[] {
  return [...opportunities].sort((a, b) => b.profitMargin - a.profitMargin)
}
