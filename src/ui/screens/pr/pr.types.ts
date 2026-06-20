// PR tab types.

export interface RunJob {
  name?: string
  status?: string
  conclusion?: string
  steps?: { name?: string; status?: string; conclusion?: string }[]
}
