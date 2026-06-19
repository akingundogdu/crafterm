import type { DbNode, DbConnNode, DbConnection } from '../../../types'
import { settings } from '../../../state'
import { persistence } from '../persistence.service'

// Saved DB connections live as `conn` nodes inside the recursive Database tree
// (settings.dbTree: DbGroup | DbConnNode). This repo exposes connection-level
// access by walking that tree. The tree's STRUCTURE (groups, nesting, drag-drop
// reorder) is a separate node-tree concern (§3.12) handled in database.ts; this
// repo covers the DbConnection entity: read / query / update-in-place.

function walk(nodes: DbNode[], visit: (n: DbConnNode) => void): void {
  for (const n of nodes) {
    if (n.kind === 'conn') visit(n)
    else walk(n.children, visit)
  }
}

export const dbConnectionRepo = {
  // All connection nodes (wrappers), in tree order — for tree rendering.
  nodes(): DbConnNode[] {
    const out: DbConnNode[] = []
    walk(settings.dbTree, (n) => out.push(n))
    return out
  },
  getAll(): DbConnection[] {
    return dbConnectionRepo.nodes().map((n) => n.conn)
  },
  get(id: string): DbConnection | undefined {
    return dbConnectionRepo.getAll().find((c) => c.id === id)
  },
  query(pred: (c: DbConnection) => boolean): DbConnection[] {
    return dbConnectionRepo.getAll().filter(pred)
  },
  // Replace a connection's data in place (wherever its node sits in the tree).
  update(conn: DbConnection): void {
    let found = false
    walk(settings.dbTree, (n) => {
      if (n.conn.id === conn.id) {
        n.conn = conn
        found = true
      }
    })
    if (found) persistence.save()
  }
}
