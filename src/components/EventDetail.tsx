import { Show } from "solid-js"
import type { ArbitrageOpportunity, IntraMarketOpportunity } from "../models/opportunity"
import { selectedOpportunity } from "../stores/opportunities"

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export function EventDetail() {
  const selected = selectedOpportunity

  return (
    <box
      border
      title="Details"
      flexDirection="column"
      style={{ width: "100%", padding: 1 }}
    >
      <Show
        when={selected()}
        fallback={
          <text fg="#888888">Select an opportunity to view details</text>
        }
      >
        {(opp) => (
          <Show
            when={opp().type === "cross-market"}
            fallback={<IntraMarketDetail opp={opp() as IntraMarketOpportunity} />}
          >
            <CrossMarketDetail opp={opp() as ArbitrageOpportunity} />
          </Show>
        )}
      </Show>
    </box>
  )
}

function CrossMarketDetail(props: { opp: ArbitrageOpportunity }) {
  const opp = () => props.opp

  return (
    <box flexDirection="column">
      <text fg="#9B59B6">
        CROSS-MARKET ARBITRAGE
      </text>

      <box style={{ marginTop: 1 }}>
        <text fg="#888888">Event: </text>
        <text>{opp().events.kalshi?.title ?? opp().events.polymarket?.title}</text>
      </box>

      <box style={{ marginTop: 1 }} flexDirection="column">
        <text>Trade Instructions:</text>

        <box style={{ marginTop: 1, paddingLeft: 2 }}>
          <text fg="#2ECC71">BUY </text>
          <text fg="#F39C12">{opp().trade.buy.side.toUpperCase()} </text>
          <text>on {opp().trade.buy.platform} @ </text>
          <text>{formatPrice(opp().trade.buy.price)}</text>
        </box>

        <box style={{ paddingLeft: 2 }}>
          <text fg="#E74C3C">SELL </text>
          <text fg="#F39C12">{opp().trade.sell.side.toUpperCase()} </text>
          <text>on {opp().trade.sell.platform} @ </text>
          <text>{formatPrice(opp().trade.sell.price)}</text>
        </box>
      </box>

      <box style={{ marginTop: 1 }} flexDirection="row">
        <box style={{ marginRight: 3 }}>
          <text fg="#888888">Profit Margin: </text>
          <text fg="#2ECC71">
            {formatPercent(opp().profitMargin)}
          </text>
        </box>

        <box style={{ marginRight: 3 }}>
          <text fg="#888888">Capital: </text>
          <text fg="#F39C12">${opp().requiredCapital}</text>
        </box>

        <box>
          <text fg="#888888">Expected: </text>
          <text fg="#2ECC71">${opp().expectedProfit.toFixed(2)}</text>
        </box>
      </box>

      <box style={{ marginTop: 1 }}>
        <text fg="#888888">Match Confidence: </text>
        <text fg={opp().confidence > 0.8 ? "#2ECC71" : "#F39C12"}>
          {formatPercent(opp().confidence * 100)}
        </text>
      </box>
    </box>
  )
}

function IntraMarketDetail(props: { opp: IntraMarketOpportunity }) {
  const opp = () => props.opp

  return (
    <box flexDirection="column">
      <text fg="#3498DB">
        INTRA-MARKET ARBITRAGE
      </text>

      <box style={{ marginTop: 1 }}>
        <text fg="#888888">Platform: </text>
        <text>{opp().market.platform.toUpperCase()}</text>
      </box>

      <box>
        <text fg="#888888">Event: </text>
        <text>{opp().market.title}</text>
      </box>

      <box style={{ marginTop: 1 }} flexDirection="column">
        <text>Mispriced Spread:</text>

        <box style={{ marginTop: 1, paddingLeft: 2 }} flexDirection="row">
          <box style={{ marginRight: 3 }}>
            <text fg="#888888">YES: </text>
            <text>{formatPrice(opp().yesPrice)}</text>
          </box>

          <box style={{ marginRight: 3 }}>
            <text fg="#888888">NO: </text>
            <text>{formatPrice(opp().noPrice)}</text>
          </box>

          <box>
            <text fg="#888888">Sum: </text>
            <text fg="#E74C3C">
              {formatPrice(opp().yesPrice + opp().noPrice)}
            </text>
            <text fg="#888888"> (should be 100¢)</text>
          </box>
        </box>
      </box>

      <box style={{ marginTop: 1 }}>
        <text>Strategy: Buy both YES and NO contracts</text>
      </box>

      <box style={{ marginTop: 1 }}>
        <text fg="#888888">Guaranteed Profit: </text>
        <text fg="#2ECC71">
          {formatPercent(opp().profitMargin)}
        </text>
      </box>
    </box>
  )
}
