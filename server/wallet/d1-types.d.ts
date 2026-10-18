// Minimal runtime protocol used by the existing financial handler in isolated tests.
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<Array<{ meta: { changes: number }; results?: Record<string,unknown>[] }>>;
}
type PagesFunction<Env> = (context: { request: Request; env: Env }) => Promise<Response>;
