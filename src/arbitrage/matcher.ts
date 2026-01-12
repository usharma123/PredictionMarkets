import type { Market, MarketPair, DomeMatchedPair } from "../models/market"
import type { DomeMatchingMarketsResponse, DomeMatchingMarket } from "../api/types"
import { domeClient } from "../api/dome"

interface MatchResult {
  kalshiMarket: Market
  polymarketMarket: Market
  confidence: number
  reason: string
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

export function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a)
  const normalizedB = normalizeTitle(b)

  if (normalizedA === normalizedB) return 1

  const distance = levenshteinDistance(normalizedA, normalizedB)
  const maxLength = Math.max(normalizedA.length, normalizedB.length)

  if (maxLength === 0) return 1

  return 1 - distance / maxLength
}

export function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "will", "be", "to", "in", "on", "at",
    "for", "of", "by", "with", "if", "or", "and", "this", "that",
  ])

  return normalizeTitle(title)
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word))
}

export function keywordOverlap(a: string, b: string): number {
  const keywordsA = new Set(extractKeywords(a))
  const keywordsB = new Set(extractKeywords(b))

  if (keywordsA.size === 0 || keywordsB.size === 0) return 0

  let overlap = 0
  for (const word of keywordsA) {
    if (keywordsB.has(word)) overlap++
  }

  return overlap / Math.min(keywordsA.size, keywordsB.size)
}

export function datesMatch(dateA?: Date, dateB?: Date): boolean {
  if (!dateA || !dateB) return false

  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

export function matchMarkets(
  kalshiMarkets: Market[],
  polymarketMarkets: Market[]
): MarketPair[] {
  const pairs: MarketPair[] = []
  const matchedPolymarket = new Set<string>()

  for (const kalshi of kalshiMarkets) {
    let bestMatch: MatchResult | null = null

    for (const poly of polymarketMarkets) {
      if (matchedPolymarket.has(poly.id)) continue

      const titleSimilarity = calculateSimilarity(kalshi.title, poly.title)
      const keywordScore = keywordOverlap(kalshi.title, poly.title)
      const dateMatch = datesMatch(kalshi.endDate, poly.endDate) ? 0.2 : 0
      const categoryMatch =
        kalshi.category &&
        poly.category &&
        kalshi.category.toLowerCase() === poly.category.toLowerCase()
          ? 0.1
          : 0

      const confidence =
        titleSimilarity * 0.5 + keywordScore * 0.2 + dateMatch + categoryMatch

      if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
        let reason = ""
        if (titleSimilarity > 0.9) reason = "Exact title match"
        else if (titleSimilarity > 0.7) reason = "Similar titles"
        else if (keywordScore > 0.7) reason = "Keyword overlap"
        else reason = "Multiple signals"

        bestMatch = {
          kalshiMarket: kalshi,
          polymarketMarket: poly,
          confidence,
          reason,
        }
      }
    }

    if (bestMatch) {
      matchedPolymarket.add(bestMatch.polymarketMarket.id)
      pairs.push({
        kalshi: bestMatch.kalshiMarket,
        polymarket: bestMatch.polymarketMarket,
        matchConfidence: bestMatch.confidence,
        matchReason: bestMatch.reason,
      })
    }
  }

  return pairs.sort((a, b) => b.matchConfidence - a.matchConfidence)
}

export function findUnmatchedMarkets(
  kalshiMarkets: Market[],
  polymarketMarkets: Market[],
  pairs: MarketPair[]
): { kalshi: Market[]; polymarket: Market[] } {
  const matchedKalshi = new Set(pairs.map((p) => p.kalshi?.id).filter(Boolean))
  const matchedPoly = new Set(pairs.map((p) => p.polymarket?.id).filter(Boolean))

  return {
    kalshi: kalshiMarkets.filter((m) => !matchedKalshi.has(m.id)),
    polymarket: polymarketMarkets.filter((m) => !matchedPoly.has(m.id)),
  }
}

// ==================== Dome API Matching ====================

/**
 * Use Dome's matching markets API for sports markets.
 * This provides pre-matched markets from Dome's backend.
 */
export async function matchMarketsWithDome(
  kalshiMarkets: Market[],
  polymarketMarkets: Market[],
  sport: "nfl" | "mlb" | "cfb" | "nba" | "nhl" | "cbb",
  date: string // YYYY-MM-DD
): Promise<MarketPair[]> {
  try {
    const response = await domeClient.getMatchingMarketsBySport({ sport, date })
    return processDomeMatchingResponse(response, kalshiMarkets, polymarketMarkets)
  } catch (err) {
    console.warn("Dome matching API failed, falling back to local matching:", err)
    return matchMarkets(kalshiMarkets, polymarketMarkets)
  }
}

/**
 * Process Dome's matching markets response into MarketPairs
 */
function processDomeMatchingResponse(
  response: DomeMatchingMarketsResponse,
  kalshiMarkets: Market[],
  polymarketMarkets: Market[]
): MarketPair[] {
  const pairs: MarketPair[] = []

  // Create lookup maps for faster matching
  const kalshiByTicker = new Map<string, Market>()
  const kalshiByEventTicker = new Map<string, Market[]>()
  const polyBySlug = new Map<string, Market>()
  const polyByConditionId = new Map<string, Market>()

  for (const market of kalshiMarkets) {
    kalshiByTicker.set(market.ticker, market)
    if (market.domeEventTicker) {
      const existing = kalshiByEventTicker.get(market.domeEventTicker) || []
      existing.push(market)
      kalshiByEventTicker.set(market.domeEventTicker, existing)
    }
  }

  for (const market of polymarketMarkets) {
    if (market.domeMarketSlug) {
      polyBySlug.set(market.domeMarketSlug, market)
    }
    if (market.domeConditionId) {
      polyByConditionId.set(market.domeConditionId, market)
    }
  }

  // Process each matching group from Dome
  for (const [key, matchedMarkets] of Object.entries(response.markets)) {
    let polymarket: Market | undefined
    let kalshi: Market | undefined

    for (const match of matchedMarkets) {
      if (match.platform === "POLYMARKET" && match.market_slug) {
        polymarket = polyBySlug.get(match.market_slug)
      } else if (match.platform === "KALSHI") {
        // Try to find by event ticker first, then by market ticker
        if (match.event_ticker) {
          const kalshiList = kalshiByEventTicker.get(match.event_ticker)
          if (kalshiList && kalshiList.length > 0) {
            kalshi = kalshiList[0] // Take the first one
          }
        }
        if (!kalshi && match.market_tickers && match.market_tickers.length > 0) {
          kalshi = kalshiByTicker.get(match.market_tickers[0])
        }
      }
    }

    if (polymarket && kalshi) {
      pairs.push({
        kalshi,
        polymarket,
        matchConfidence: 1.0, // Dome-matched markets have high confidence
        matchReason: "Dome API match",
      })
    }
  }

  return pairs
}

/**
 * Parse Dome matching response into structured pairs
 */
export function parseDomeMatchedPairs(response: DomeMatchingMarketsResponse): DomeMatchedPair[] {
  const pairs: DomeMatchedPair[] = []

  for (const [key, matchedMarkets] of Object.entries(response.markets)) {
    const pair: DomeMatchedPair = { key }

    for (const match of matchedMarkets) {
      if (match.platform === "POLYMARKET") {
        pair.polymarket = {
          market_slug: match.market_slug || "",
          token_ids: match.token_ids || [],
        }
      } else if (match.platform === "KALSHI") {
        pair.kalshi = {
          event_ticker: match.event_ticker || "",
          market_tickers: match.market_tickers || [],
        }
      }
    }

    pairs.push(pair)
  }

  return pairs
}

/**
 * Hybrid matching: Use Dome API when available, fall back to local matching
 */
export async function hybridMatchMarkets(
  kalshiMarkets: Market[],
  polymarketMarkets: Market[],
  useDomeApi: boolean = true
): Promise<MarketPair[]> {
  if (!useDomeApi || !domeClient.isConfigured()) {
    return matchMarkets(kalshiMarkets, polymarketMarkets)
  }

  // For now, use local matching since Dome's matching is primarily for sports
  // In the future, this could be enhanced to use Dome's API for supported categories
  return matchMarkets(kalshiMarkets, polymarketMarkets)
}
