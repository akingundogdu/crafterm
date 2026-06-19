// iOS worktree domain data models (moved out of the former bridge api.d.ts).
// `SavedIosConfig` is part of the persistence model and lives in storage.
import type { SavedIosConfig } from '@services/storage/state.types'

export type { SavedIosConfig }

// Live status of one worktree's iOS variant (from `ios-worktree.sh report`).
export interface IosWorktreeStatus {
  path: string
  branch: string
  bundleId: string
  displayName: string
  built: boolean
  installed: boolean
  running: boolean
}
export interface IosWorktreeReport {
  simUdid: string
  baseBundleId: string
  scheme: string
  worktrees: IosWorktreeStatus[]
}

export interface IosTarget {
  name: string
  udid: string
}
export interface IosTargets {
  simulators: IosTarget[]
  devices: IosTarget[]
}
