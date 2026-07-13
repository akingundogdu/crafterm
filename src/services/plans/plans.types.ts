// Plans domain data models (moved out of the former bridge api.d.ts).

// One plan markdown for a branch, with its parsed owner attribution.
export interface PlanForBranch {
  name: string
  slug: string
  path: string
  mtime: number
  ownerStableId: string | null
  ownerSessionId: string | null
}

// One plan markdown aggregated across project paths (Notebook "Plans" section).
export interface PlanScanEntry {
  project: string
  name: string
  path: string
  mtime: number
}
