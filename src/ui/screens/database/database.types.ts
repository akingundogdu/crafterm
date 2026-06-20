import type { DbGroup, DbConnNode, DbConnection } from '@ui/types/types'

// Database tree node types.

export type DbSectionKind = 'Tables' | 'Views' | 'Procedures' | 'Queries'

// Unified tree node: real groups/connections plus the dynamic object/query rows.
export type DbTreeNode =
  | { t: 'group'; g: DbGroup }
  | { t: 'conn'; c: DbConnNode }
  | { t: 'section'; conn: DbConnection; kind: DbSectionKind }
  | { t: 'object'; conn: DbConnection; kind: 'Tables' | 'Views' | 'Procedures'; name: string }
  | { t: 'query'; conn: DbConnection; file: { name: string; path: string } }
