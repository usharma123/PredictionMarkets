import { createSignal, createMemo, createEffect } from "solid-js"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"
import { detector, type DetectionResult } from "../arbitrage/detector"
import { kalshiMarkets, polymarketMarkets } from "./markets"
import {
  isDatabaseAvailable,
  opportunitiesRepository,
  marketsRepository,
} from "../db"

export type OpportunityFilter = "all" | "cross-market" | "intra-market"
export type SortField = "profit" | "confidence" | "time"
export type SortOrder = "asc" | "desc"

const [crossMarketOpportunities, setCrossMarketOpportunities] = createSignal<
  ArbitrageOpportunity[]
>([])
const [intraMarketOpportunities, setIntraMarketOpportunities] = createSignal<
  IntraMarketOpportunity[]
>([])
const [selectedId, setSelectedId] = createSignal<string | null>(null)
const [filter, setFilter] = createSignal<OpportunityFilter>("all")
const [sortField, setSortField] = createSignal<SortField>("profit")
const [sortOrder, setSortOrder] = createSignal<SortOrder>("desc")
const [minProfit, setMinProfit] = createSignal(0.5)
const [lastScanId, setLastScanId] = createSignal<number | null>(null)
const [scanCount, setScanCount] = createSignal(0)

export function detectOpportunities(): DetectionResult {
  const result = detector.detect(kalshiMarkets(), polymarketMarkets())
  setCrossMarketOpportunities(result.crossMarket)
  setIntraMarketOpportunities(result.intraMarket)
  setScanCount((c) => c + 1)

  // Persist to DB in background (non-blocking)
  persistOpportunitiesToDb(result).catch((err) => {
    console.warn("Failed to persist opportunities:", err)
  })

  return result
}

async function persistOpportunitiesToDb(result: DetectionResult): Promise<void> {
  try {
    const dbAvailable = await isDatabaseAvailable()
    if (!dbAvailable) return

    // Start scan tracking
    const scanId = await opportunitiesRepository.startScan()
    setLastScanId(parseInt(scanId, 10))

    // Get market DB IDs for mapping (separate by platform)
    const kalshiIds = kalshiMarkets().map((m) => m.id)
    const polyIds = polymarketMarkets().map((m) => m.id)

    const kalshiIdMap = await marketsRepository.getDbIds("kalshi", kalshiIds)
    const polyIdMap = await marketsRepository.getDbIds("polymarket", polyIds)

    // Persist cross-market opportunities
    for (const opp of result.crossMarket) {
      const kalshiMarket = opp.events.kalshi
      const polyMarket = opp.events.polymarket

      if (!kalshiMarket || !polyMarket) continue

      const kalshiDbId = kalshiIdMap.get(kalshiMarket.id)
      const polyDbId = polyIdMap.get(polyMarket.id)

      if (kalshiDbId && polyDbId) {
        await opportunitiesRepository.upsertCrossMarketOpportunity(
          opp,
          kalshiDbId,
          polyDbId
        )
      }
    }

    // Complete scan
    await opportunitiesRepository.completeScan(scanId, {
      kalshiCount: kalshiMarkets().length,
      polymarketCount: polymarketMarkets().length,
      crossOpportunities: result.crossMarket.length,
      intraOpportunities: result.intraMarket.length,
    })
  } catch (err) {
    console.warn("Error persisting opportunities:", err)
  }
}

export const filteredOpportunities = createMemo(() => {
  const cross = crossMarketOpportunities()
  const intra = intraMarketOpportunities()
  const currentFilter = filter()
  const currentMinProfit = minProfit()

  let result: (ArbitrageOpportunity | IntraMarketOpportunity)[] = []

  if (currentFilter === "all" || currentFilter === "cross-market") {
    result.push(...cross.filter((o) => o.profitMargin >= currentMinProfit))
  }

  if (currentFilter === "all" || currentFilter === "intra-market") {
    result.push(...intra.filter((o) => o.profitMargin >= currentMinProfit))
  }

  // Sort
  const field = sortField()
  const order = sortOrder()

  result.sort((a, b) => {
    let comparison = 0

    switch (field) {
      case "profit":
        comparison = a.profitMargin - b.profitMargin
        break
      case "confidence":
        comparison =
          ("confidence" in a ? a.confidence : 1) -
          ("confidence" in b ? b.confidence : 1)
        break
      case "time":
        comparison = a.detectedAt.getTime() - b.detectedAt.getTime()
        break
    }

    return order === "desc" ? -comparison : comparison
  })

  return result
})

export const totalOpportunities = createMemo(() => {
  return crossMarketOpportunities().length + intraMarketOpportunities().length
})

export const selectedOpportunity = createMemo(() => {
  const id = selectedId()
  if (!id) return null

  const cross = crossMarketOpportunities().find((o) => o.id === id)
  if (cross) return cross

  const intra = intraMarketOpportunities().find((o) => o.id === id)
  return intra ?? null
})

export function selectOpportunity(id: string | null): void {
  setSelectedId(id)
}

export function selectNext(): void {
  const opportunities = filteredOpportunities()
  const currentId = selectedId()

  if (opportunities.length === 0) return

  if (!currentId) {
    setSelectedId(opportunities[0].id)
    return
  }

  const currentIndex = opportunities.findIndex((o) => o.id === currentId)
  const nextIndex = (currentIndex + 1) % opportunities.length
  setSelectedId(opportunities[nextIndex].id)
}

export function selectPrev(): void {
  const opportunities = filteredOpportunities()
  const currentId = selectedId()

  if (opportunities.length === 0) return

  if (!currentId) {
    setSelectedId(opportunities[opportunities.length - 1].id)
    return
  }

  const currentIndex = opportunities.findIndex((o) => o.id === currentId)
  const prevIndex =
    currentIndex <= 0 ? opportunities.length - 1 : currentIndex - 1
  setSelectedId(opportunities[prevIndex].id)
}

export function useOpportunities() {
  return {
    crossMarket: crossMarketOpportunities,
    intraMarket: intraMarketOpportunities,
    filtered: filteredOpportunities,
    total: totalOpportunities,
    selected: selectedOpportunity,
    selectedId,
    filter,
    sortField,
    sortOrder,
    minProfit,
    lastScanId,
    scanCount,
    setFilter,
    setSortField,
    setSortOrder,
    setMinProfit,
    selectOpportunity,
    selectNext,
    selectPrev,
    detect: detectOpportunities,
  }
}

export {
  crossMarketOpportunities,
  intraMarketOpportunities,
  filter as opportunityFilter,
  sortField as opportunitySortField,
  sortOrder as opportunitySortOrder,
  minProfit as opportunityMinProfit,
  lastScanId,
  scanCount,
}
