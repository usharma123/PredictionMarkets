import { Show } from "solid-js"
import { kalshiConnected, polymarketConnected, marketsLastUpdated } from "../stores/markets"
import { totalOpportunities } from "../stores/opportunities"

function formatTimeSince(date: Date | null): string {
  if (!date) return "Never"
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

export function StatusBar() {
  return (
    <box
      flexDirection="row"
      style={{ width: "100%", paddingLeft: 1, paddingRight: 1 }}
    >
      <box flexDirection="row" style={{ flexGrow: 1 }}>
        <text>Kalshi: </text>
        <Show
          when={kalshiConnected()}
          fallback={<text fg="#E74C3C">● Disconnected</text>}
        >
          <text fg="#2ECC71">● Connected</text>
        </Show>

        <text style={{ marginLeft: 2 }}>Polymarket: </text>
        <Show
          when={polymarketConnected()}
          fallback={<text fg="#E74C3C">● Disconnected</text>}
        >
          <text fg="#2ECC71">● Connected</text>
        </Show>
      </box>

      <box flexDirection="row">
        <text fg="#888888">
          Updated: {formatTimeSince(marketsLastUpdated())}
        </text>
        <text style={{ marginLeft: 2 }}>
          Opportunities: <text fg="#F39C12">{totalOpportunities()}</text>
        </text>
      </box>
    </box>
  )
}
