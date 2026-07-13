import type { DbConnection } from './db-connection'

// Database sidebar tree — mirrors `DbGroup`/`DbConnNode`/`DbNode` in types.ts
// exactly (HR-1). Defined here (not imported from @ui) so the model layer stays
// @ui-independent and typechecks under the node project. Persisted into the
// single crafterm-state.json; dbConnectionRepo + the database screen operate on
// dbTree (mutated in place: push/splice/reorder), so the reference is stable.
type NodeColor = string | null

export interface DbGroup {
  kind: 'group'
  id: string
  name: string
  collapsed: boolean
  color?: NodeColor
  children: DbNode[]
}

export interface DbConnNode {
  kind: 'conn'
  id: string
  collapsed: boolean
  color?: NodeColor
  conn: DbConnection
}

export type DbNode = DbGroup | DbConnNode

export const dbTree: DbNode[] = []

export function setDbTree(next: DbNode[]): void {
  dbTree.length = 0
  dbTree.push(...next)
}
