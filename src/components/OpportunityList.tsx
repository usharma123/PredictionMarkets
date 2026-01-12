import { For, Show } from "solid-js"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"
import { filteredOpportunities, useOpportunities } from "../stores/opportunities"

function formatProfit(margin: number): string {
  return `${margin.toFixed(2)}%`
}

function formatCapital(amount: number): string {
  return `$${amount.toFixed(0)}`
}

function truncateTitle(title: string, maxLength: number = 30): string {
  if (title.length <= maxLength) return title
  return title.slice(0, maxLength - 3) + "..."
}

function getEventTitle(
  opp: ArbitrageOpportunity | IntraMarketOpportunity
): string {
  if (opp.type === "intra-market") {
    return (opp as IntraMarketOpportunity).market.title
  }
  const cross = opp as ArbitrageOpportunity
  return cross.events.kalshi?.title ?? cross.events.polymarket?.title ?? "Unknown"
}

function getPlatformLabel(
  opp: ArbitrageOpportunity | IntraMarketOpportunity
): string {
  if (opp.type === "intra-market") {
    return (opp as IntraMarketOpportunity).market.platform.toUpperCase()
  }
  return "CROSS"
}

export function OpportunityList() {
  const { selectOpportunity, selectedId } = useOpportunities()
  const opportunities = filteredOpportunities

  return (
    <box flexDirection="column" style={{ flexGrow: 1, width: "100%" }}>
      {/* Header */}
      <box
        flexDirection="row"
        style={{
          width: "100%",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: "#2C3E50",
        }}
      >
        <text style={{ width: 8 }} fg="#ECF0F1">
          <strong>Type</strong>
        </text>
        <text style={{ width: 35, flexGrow: 1 }} fg="#ECF0F1">
          <strong>Event</strong>
        </text>
        <text style={{ width: 10 }} fg="#ECF0F1">
          <strong>Profit</strong>
        </text>
        <text style={{ width: 10 }} fg="#ECF0F1">
          <strong>Capital</strong>
        </text>
      </box>

      {/* List */}
      <scrollbox style={{ flexGrow: 1 }}>
        <Show
          when={opportunities().length > 0}
          fallback={
            <box style={{ padding: 2 }}>
              <text fg="#888888">No arbitrage opportunities found</text>
            </box>
          }
        >
          <For each={opportunities()}>
            {(opp) => {
              const isSelected = () => selectedId() === opp.id
              return (
                <box
                  flexDirection="row"
                  style={{
                    width: "100%",
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: isSelected() ? "#34495E" : "transparent",
                  }}
                  onMouseDown={() => selectOpportunity(opp.id)}
                >
                  <text
                    style={{ width: 8 }}
                    fg={opp.type === "cross-market" ? "#9B59B6" : "#3498DB"}
                  >
                    {getPlatformLabel(opp)}
                  </text>
                  <text style={{ width: 35, flexGrow: 1 }}>
                    {truncateTitle(getEventTitle(opp))}
                  </text>
                  <text style={{ width: 10 }} fg="#2ECC71">
                    <strong>{formatProfit(opp.profitMargin)}</strong>
                  </text>
                  <text style={{ width: 10 }} fg="#F39C12">
                    {opp.type === "cross-market"
                      ? formatCapital((opp as ArbitrageOpportunity).requiredCapital)
                      : "-"}
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>
    </box>
  )
}
