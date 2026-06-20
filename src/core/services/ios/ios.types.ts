export interface IosCfg {
  project?: string
  scheme?: string
  baseBundleId?: string
  displayPrefix?: string
  defaultSimulator?: string
  copyFiles?: string[]
  worktreesDir?: string
}

export interface IosTarget {
  name: string
  udid: string
}
