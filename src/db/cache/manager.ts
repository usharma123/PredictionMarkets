import type { Market } from "../../models/market"

interface CacheEntry<T> {
  data: T
  timestamp: Date
  ttlMs: number
}

interface CacheConfig {
  marketsTtlMs: number
  snapshotsTtlMs: number
  opportunitiesTtlMs: number
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  marketsTtlMs: parseInt(process.env.CACHE_MARKETS_TTL_MS ?? "30000"),
  snapshotsTtlMs: parseInt(process.env.CACHE_SNAPSHOTS_TTL_MS ?? "10000"),
  opportunitiesTtlMs: parseInt(process.env.CACHE_OPPORTUNITIES_TTL_MS ?? "5000"),
}

export type DataSource = "api" | "cache" | "db"

export interface FreshnessInfo {
  isStale: boolean
  ageMs: number
  source: DataSource
}

export class CacheManager {
  private config: CacheConfig
  private marketsCache: Map<string, CacheEntry<Market[]>> = new Map()
  private snapshotsCache: Map<string, CacheEntry<unknown>> = new Map()
  private opportunitiesCache: CacheEntry<unknown> | null = null

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
  }

  // ============================================
  // Validation
  // ============================================

  private isValid<T>(entry: CacheEntry<T> | undefined | null): entry is CacheEntry<T> {
    if (!entry) return false
    const age = Date.now() - entry.timestamp.getTime()
    return age < entry.ttlMs
  }

  private getAge(entry: CacheEntry<unknown> | undefined | null): number {
    if (!entry) return Infinity
    return Date.now() - entry.timestamp.getTime()
  }

  // ============================================
  // Markets Cache
  // ============================================

  getCachedMarkets(platform: string): Market[] | null {
    const entry = this.marketsCache.get(platform)
    return this.isValid(entry) ? entry.data : null
  }

  setCachedMarkets(platform: string, markets: Market[]): void {
    this.marketsCache.set(platform, {
      data: markets,
      timestamp: new Date(),
      ttlMs: this.config.marketsTtlMs,
    })
  }

  getMarketsFreshness(platform: string): FreshnessInfo {
    const entry = this.marketsCache.get(platform)
    const ageMs = this.getAge(entry)
    return {
      isStale: !this.isValid(entry),
      ageMs,
      source: ageMs < 1000 ? "api" : ageMs < this.config.marketsTtlMs ? "cache" : "db",
    }
  }

  // ============================================
  // Snapshots Cache
  // ============================================

  getCachedSnapshot<T>(marketId: string): T | null {
    const entry = this.snapshotsCache.get(marketId)
    return this.isValid(entry) ? (entry.data as T) : null
  }

  setCachedSnapshot<T>(marketId: string, snapshot: T): void {
    this.snapshotsCache.set(marketId, {
      data: snapshot,
      timestamp: new Date(),
      ttlMs: this.config.snapshotsTtlMs,
    })
  }

  // ============================================
  // Opportunities Cache
  // ============================================

  getCachedOpportunities<T>(): T | null {
    return this.isValid(this.opportunitiesCache)
      ? (this.opportunitiesCache.data as T)
      : null
  }

  setCachedOpportunities<T>(opportunities: T): void {
    this.opportunitiesCache = {
      data: opportunities,
      timestamp: new Date(),
      ttlMs: this.config.opportunitiesTtlMs,
    }
  }

  // ============================================
  // Invalidation
  // ============================================

  invalidateMarkets(platform?: string): void {
    if (platform) {
      this.marketsCache.delete(platform)
    } else {
      this.marketsCache.clear()
    }
  }

  invalidateSnapshot(marketId: string): void {
    this.snapshotsCache.delete(marketId)
  }

  invalidateOpportunities(): void {
    this.opportunitiesCache = null
  }

  invalidateAll(): void {
    this.marketsCache.clear()
    this.snapshotsCache.clear()
    this.opportunitiesCache = null
  }

  // ============================================
  // Statistics
  // ============================================

  getStats() {
    return {
      marketsEntries: this.marketsCache.size,
      snapshotsEntries: this.snapshotsCache.size,
      hasOpportunitiesCache: this.opportunitiesCache !== null,
      config: this.config,
    }
  }

  // ============================================
  // Configuration
  // ============================================

  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): CacheConfig {
    return { ...this.config }
  }
}

// Singleton instance
export const cacheManager = new CacheManager()
