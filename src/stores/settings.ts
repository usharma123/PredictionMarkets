import { createSignal } from "solid-js"

export interface Settings {
  refreshIntervalMs: number
  minProfitThreshold: number
  showIntraMarket: boolean
  showCrossMarket: boolean
  darkMode: boolean
}

const DEFAULT_SETTINGS: Settings = {
  refreshIntervalMs: 30000,
  minProfitThreshold: 0.5,
  showIntraMarket: true,
  showCrossMarket: true,
  darkMode: true,
}

const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS)

export function updateSettings(updates: Partial<Settings>): void {
  setSettings((current) => ({ ...current, ...updates }))
}

export function resetSettings(): void {
  setSettings(DEFAULT_SETTINGS)
}

export function useSettings() {
  return {
    settings,
    updateSettings,
    resetSettings,
  }
}

export { settings }
