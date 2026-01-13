import { Show } from "solid-js"
import { kalshiConnected, polymarketConnected, marketsLastUpdated, dbConnected, dataSource } from "../stores/markets"
import { totalOpportunities, scanCount } from "../stores/opportunities"

function formatTimeSince(date: Date | null): string {
  if (!date) return "Never"
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

function getSourceColor(source: string): string {
  switch (source) {
    case "api": return "#2ECC71"  // green - fresh from API
    case "cache": return "#F39C12"  // orange - from cache
    case "db": return "#3498DB"  // blue - from database
    default: return "#888888"
  }
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
          fallback={<text fg="#E74C3C">● Off</text>}
        >
          <text fg="#2ECC71">● On</text>
        </Show>

        <text style={{ marginLeft: 2 }}>Poly: </text>
        <Show
          when={polymarketConnected()}
          fallback={<text fg="#E74C3C">● Off</text>}
        >
          <text fg="#2ECC71">● On</text>
        </Show>

        <text style={{ marginLeft: 2 }}>DB: </text>
        <Show
          when={dbConnected()}
          fallback={<text fg="#E74C3C">● Off</text>}
        >
          <text fg="#2ECC71">● On</text>
        </Show>

        <text style={{ marginLeft: 2 }}>Src: </text>
        <text fg={getSourceColor(dataSource())}>{dataSource().toUpperCase()}</text>
      </box>

      <box flexDirection="row">
        <text fg="#888888">
          {formatTimeSince(marketsLastUpdated())}
        </text>
        <text style={{ marginLeft: 2 }}>Opps: </text>
        <text fg="#F39C12">{totalOpportunities()}</text>
        <text style={{ marginLeft: 1 }}>Scans: </text>
        <text fg="#9B59B6">{scanCount()}</text>
      </box>
    </box>
  )
}
