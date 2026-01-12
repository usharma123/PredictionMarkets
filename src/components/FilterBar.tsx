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
    { value: "cross-market", label: "Cross-Market" },
    { value: "intra-market", label: "Intra-Market" },
  ]

  const sortOptions: { value: SortField; label: string }[] = [
    { value: "profit", label: "Profit" },
    { value: "confidence", label: "Confidence" },
    { value: "time", label: "Time" },
  ]

  return (
    <box
      flexDirection="row"
      style={{ width: "100%", paddingLeft: 1, paddingRight: 1, gap: 2 }}
    >
      <box flexDirection="row">
        <text fg="#888888">Filter: </text>
        <tab-select
          options={filters.map((f) => ({ label: f.label, value: f.value }))}
          selected={opportunityFilter()}
          onChange={(value: string) => setFilter(value as OpportunityFilter)}
        />
      </box>

      <box flexDirection="row">
        <text fg="#888888">Sort: </text>
        <tab-select
          options={sortOptions.map((s) => ({ label: s.label, value: s.value }))}
          selected={opportunitySortField()}
          onChange={(value: string) => setSortField(value as SortField)}
        />
      </box>

      <box flexDirection="row">
        <text fg="#888888">Min Profit: {opportunityMinProfit()}%</text>
      </box>
    </box>
  )
}
