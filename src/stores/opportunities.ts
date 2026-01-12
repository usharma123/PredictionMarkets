import { createSignal, createMemo, createEffect } from "solid-js"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"
import { detector, type DetectionResult } from "../arbitrage/detector"
import { kalshiMarkets, polymarketMarkets } from "./markets"

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

export function detectOpportunities(): DetectionResult {
  const result = detector.detect(kalshiMarkets(), polymarketMarkets())
  setCrossMarketOpportunities(result.crossMarket)
  setIntraMarketOpportunities(result.intraMarket)
  return result
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
}
