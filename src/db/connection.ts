import postgres from "postgres"

export type Sql = ReturnType<typeof postgres>

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  maxConnections?: number
  idleTimeout?: number
}

const DEFAULT_CONFIG: DatabaseConfig = {
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432"),
  database: process.env.DB_NAME ?? "predmarket",
  username: process.env.DB_USER ?? "predmarket",
  password: process.env.DB_PASSWORD ?? "predmarket_dev",
  maxConnections: 10,
  idleTimeout: 30,
}

let sql: ReturnType<typeof postgres> | null = null

export function getConnection(config?: Partial<DatabaseConfig>) {
  if (!sql) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    sql = postgres({
      host: finalConfig.host,
      port: finalConfig.port,
      database: finalConfig.database,
      username: finalConfig.username,
      password: finalConfig.password,
      max: finalConfig.maxConnections,
      idle_timeout: finalConfig.idleTimeout,
      transform: {
        undefined: null,
      },
    })
  }
  return sql
}

export async function closeConnection(): Promise<void> {
  if (sql) {
    await sql.end()
    sql = null
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const conn = getConnection()
    await conn`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const conn = getConnection()
    const result = await conn`SELECT 1 as ok`
    return result.length > 0
  } catch {
    return false
  }
}
