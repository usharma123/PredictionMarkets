import type { Market, MarketPair } from "../models/market"

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
