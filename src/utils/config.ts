import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export interface BotConfig {
  refreshIntervalMs: number
  minProfitThreshold: number
  kalshiApiKey?: string
  kalshiApiSecret?: string
  polymarketApiKey?: string
}

const CONFIG_DIR = join(homedir(), ".bot")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")

const DEFAULT_CONFIG: BotConfig = {
  refreshIntervalMs: 30000,
  minProfitThreshold: 0.5,
}

export function loadConfig(): BotConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return DEFAULT_CONFIG
    }

    const content = readFileSync(CONFIG_FILE, "utf-8")
    const parsed = JSON.parse(content)

    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: Partial<BotConfig>): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    const current = loadConfig()
    const updated = { ...current, ...config }

    writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2))
  } catch (error) {
    console.error("Failed to save config:", error)
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE
}
