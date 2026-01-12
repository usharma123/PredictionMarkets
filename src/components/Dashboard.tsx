import { createEffect, onCleanup, Show } from "solid-js"
import { StatusBar } from "./StatusBar"
import { FilterBar } from "./FilterBar"
import { OpportunityList } from "./OpportunityList"
import { EventDetail } from "./EventDetail"
import { HelpBar } from "./HelpBar"
import {
  useMarkets,
  marketsLoading,
  marketsError,
} from "../stores/markets"
import { useOpportunities, selectedOpportunity } from "../stores/opportunities"

export function Dashboard() {
  const { startAutoRefresh, stopAutoRefresh, refresh } = useMarkets()
  const { detect, selectNext, selectPrev } = useOpportunities()

  // Start fetching data and detecting opportunities
  createEffect(() => {
    startAutoRefresh(30000)

    onCleanup(() => {
      stopAutoRefresh()
    })
  })

  // Re-detect opportunities when markets update
  createEffect(() => {
    detect()
  })

  return (
    <box
      flexDirection="column"
      border
      title="BOT - Prediction Market Arbitrage"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Status Bar */}
      <StatusBar />

      {/* Divider */}
      <box style={{ width: "100%", height: 1, backgroundColor: "#2C3E50" }} />

      {/* Filter Bar */}
      <FilterBar />

      {/* Divider */}
      <box style={{ width: "100%", height: 1, backgroundColor: "#2C3E50" }} />

      {/* Main Content */}
      <box flexDirection="row" style={{ flexGrow: 1 }}>
        {/* Opportunity List */}
        <box style={{ width: "60%", height: "100%" }}>
          <Show
            when={!marketsLoading()}
            fallback={
              <box style={{ padding: 2 }}>
                <text fg="#F39C12">Loading markets...</text>
              </box>
            }
          >
            <Show
              when={!marketsError()}
              fallback={
                <box style={{ padding: 2 }}>
                  <text fg="#E74C3C">Error: {marketsError()}</text>
                </box>
              }
            >
              <OpportunityList />
            </Show>
          </Show>
        </box>

        {/* Vertical Divider */}
        <box style={{ width: 1, height: "100%", backgroundColor: "#2C3E50" }} />

        {/* Event Detail */}
        <box style={{ width: "40%", height: "100%", padding: 1 }}>
          <EventDetail />
        </box>
      </box>

      {/* Help Bar */}
      <box style={{ width: "100%", height: 1, backgroundColor: "#2C3E50" }} />
      <HelpBar />
    </box>
  )
}
