export type NbSubTab = 'notes' | 'plans' | 'daily' | 'meeting'

// A docs/plans markdown file discovered by the Plans tab scan.
export interface PlanItem {
  project: string
  name: string
  path: string
  mtime: number
}
