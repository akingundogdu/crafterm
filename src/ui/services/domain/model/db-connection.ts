import { z } from 'zod'

// Saved database connection — mirrors `DbConnection` + `DbEngine` in types.ts
// exactly (HR-1). The Database sidebar tree (`DbGroup`/`DbConnNode`) is a
// recursive node tree, modeled with the other tree entities during persistence
// wiring (node rows, §3.12).

export const dbEngine = z.enum(['postgres', 'mysql', 'sqlite'])

export const dbConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  engine: dbEngine,
  host: z.string().optional(),
  port: z.number().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  ssl: z.boolean().optional(),
  file: z.string().optional() // sqlite db file path
})

export type DbEngine = z.infer<typeof dbEngine>
export type DbConnection = z.infer<typeof dbConnectionSchema>

export function makeDbConnection(
  p: Partial<DbConnection> & Pick<DbConnection, 'name' | 'engine'>
): DbConnection {
  return dbConnectionSchema.parse({ id: crypto.randomUUID(), ...p })
}
