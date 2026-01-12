import { For, Show } from "solid-js"
import { marketSearchResults, useMarkets } from "../stores/markets"

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`
}

function truncateTitle(title: string, maxLength: number = 32): string {
  if (title.length <= maxLength) return title
  return title.slice(0, maxLength - 3) + "..."
}

function getPlatformColor(platform: string): string {
  return platform === "kalshi" ? "#3498DB" : "#9B59B6"
}

export function MarketSearchResults() {
  const { selectedSearchMarketKey, setSelectedSearchMarketKey } = useMarkets()
  const results = marketSearchResults

  return (
    <box flexDirection="column" style={{ flexGrow: 1, width: "100%" }}>
      <box
        flexDirection="row"
        style={{
          width: "100%",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: "#2C3E50",
        }}
      >
        <text style={{ width: 10 }} fg="#ECF0F1">
          Platform
        </text>
        <text style={{ width: 35, flexGrow: 1 }} fg="#ECF0F1">
          Market
        </text>
        <text style={{ width: 8 }} fg="#ECF0F1">
          Match
        </text>
      </box>

      <scrollbox style={{ flexGrow: 1 }}>
        <Show
          when={results().length > 0}
          fallback={
            <box style={{ padding: 2 }}>
              <text fg="#888888">No matching markets found</text>
            </box>
          }
        >
          <For each={results()}>
            {(result) => {
              const isSelected = () => selectedSearchMarketKey() === result.key
              return (
                <box
                  flexDirection="row"
                  style={{
                    width: "100%",
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: isSelected() ? "#34495E" : "transparent",
                  }}
                  onMouseDown={() => setSelectedSearchMarketKey(result.key)}
                >
                  <text
                    style={{ width: 10 }}
                    fg={getPlatformColor(result.market.platform)}
                  >
                    {result.market.platform.toUpperCase()}
                  </text>
                  <text style={{ width: 35, flexGrow: 1 }}>
                    {truncateTitle(result.market.title)}
                  </text>
                  <text style={{ width: 8 }} fg="#2ECC71">
                    {formatScore(result.score)}
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
