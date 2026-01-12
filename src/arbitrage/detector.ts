import type { Market } from "../models/market"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"
import { matchMarkets } from "./matcher"
import {
  calculateCrossMarketArbitrage,
  calculateIntraMarketArbitrage,
  sortByProfitMargin,
  DEFAULT_FEES,
  type FeeStructure,
} from "./calculator"

export interface DetectionResult {
  crossMarket: ArbitrageOpportunity[]
  intraMarket: IntraMarketOpportunity[]
  totalOpportunities: number
  bestOpportunity: ArbitrageOpportunity | IntraMarketOpportunity | null
  detectedAt: Date
}

export interface DetectorConfig {
  minProfitMargin: number
  minConfidence: number
  fees: FeeStructure
}

const DEFAULT_CONFIG: DetectorConfig = {
  minProfitMargin: 0.5,
  minConfidence: 0.6,
  fees: DEFAULT_FEES,
}

export class ArbitrageDetector {
  private config: DetectorConfig

  constructor(config?: Partial<DetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  detect(kalshiMarkets: Market[], polymarketMarkets: Market[]): DetectionResult {
    const detectedAt = new Date()

    // Find cross-market arbitrage
    const pairs = matchMarkets(kalshiMarkets, polymarketMarkets)
    const crossMarket = pairs
      .filter((pair) => pair.matchConfidence >= this.config.minConfidence)
      .map((pair) => calculateCrossMarketArbitrage(pair, this.config.fees))
      .filter((opp): opp is ArbitrageOpportunity => opp !== null)
      .filter((opp) => opp.profitMargin >= this.config.minProfitMargin)

    // Find intra-market arbitrage on both platforms
    const kalshiIntra = kalshiMarkets
      .map((market) => calculateIntraMarketArbitrage(market, this.config.fees))
      .filter((opp): opp is IntraMarketOpportunity => opp !== null)
      .filter((opp) => opp.profitMargin >= this.config.minProfitMargin)

    const polymarketIntra = polymarketMarkets
      .map((market) => calculateIntraMarketArbitrage(market, this.config.fees))
      .filter((opp): opp is IntraMarketOpportunity => opp !== null)
      .filter((opp) => opp.profitMargin >= this.config.minProfitMargin)

    const intraMarket = sortByProfitMargin([...kalshiIntra, ...polymarketIntra])
    const sortedCross = sortByProfitMargin(crossMarket)

    const totalOpportunities = sortedCross.length + intraMarket.length

    // Find best overall opportunity
    let bestOpportunity: ArbitrageOpportunity | IntraMarketOpportunity | null = null
    if (sortedCross.length > 0 && intraMarket.length > 0) {
      bestOpportunity =
        sortedCross[0].profitMargin > intraMarket[0].profitMargin
          ? sortedCross[0]
          : intraMarket[0]
    } else if (sortedCross.length > 0) {
      bestOpportunity = sortedCross[0]
    } else if (intraMarket.length > 0) {
      bestOpportunity = intraMarket[0]
    }

    return {
      crossMarket: sortedCross,
      intraMarket,
      totalOpportunities,
      bestOpportunity,
      detectedAt,
    }
  }

  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): DetectorConfig {
    return { ...this.config }
  }
}

export const detector = new ArbitrageDetector()
