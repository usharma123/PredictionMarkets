import { For } from "solid-js"
import {
  opportunityFilter,
  opportunitySortField,
  opportunityMinProfit,
  useOpportunities,
  type OpportunityFilter,
  type SortField,
} from "../stores/opportunities"

export function FilterBar() {
  const { setFilter, setSortField, setMinProfit } = useOpportunities()

  const filters: { value: OpportunityFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "cross-market", label: "Cross" },
    { value: "intra-market", label: "Intra" },
  ]

  const sortOptions: { value: SortField; label: string }[] = [
    { value: "profit", label: "Profit" },
    { value: "confidence", label: "Confidence" },
    { value: "time", label: "Time" },
  ]

  return (
    <box
      flexDirection="row"
      style={{ width: "100%", paddingLeft: 1, paddingRight: 1 }}
    >
      <box flexDirection="row">
        <text fg="#888888">Filter: </text>
        <For each={filters}>
          {(f) => (
            <text
              fg={opportunityFilter() === f.value ? "#2ECC71" : "#ECF0F1"}
              style={{ marginRight: 1 }}
            >
              [{f.label}]
            </text>
          )}
        </For>
      </box>

      <box flexDirection="row" style={{ marginLeft: 2 }}>
        <text fg="#888888">Sort: </text>
        <For each={sortOptions}>
          {(s) => (
            <text
              fg={opportunitySortField() === s.value ? "#2ECC71" : "#ECF0F1"}
              style={{ marginRight: 1 }}
            >
              [{s.label}]
            </text>
          )}
        </For>
      </box>

      <box flexDirection="row" style={{ marginLeft: 2 }}>
        <text fg="#888888">Min Profit: {opportunityMinProfit()}%</text>
      </box>
    </box>
  )
}
