import { getConnection, type Sql } from "../connection"

export abstract class BaseRepository {
  protected get sql() {
    return getConnection()
  }

  protected async transaction<T>(
    fn: (sql: Sql) => Promise<T>
  ): Promise<T> {
    // postgres.js begin() accepts a callback that receives a transaction sql
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.sql.begin(fn as any) as Promise<T>
  }
}
