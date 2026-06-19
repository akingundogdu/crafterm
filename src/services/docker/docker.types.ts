// Docker domain data models (moved out of the former bridge api.d.ts).
export type DockerKind = 'container' | 'image' | 'volume' | 'network'

// Each docker `--format '{{json .}}'` row is a flat string map; field names vary
// by object kind (Names/Status for containers, Repository/Tag for images, …).
export type DockerRow = Record<string, string>

export interface DockerAvailable {
  ok: boolean
  version?: string
  error?: string
}
export interface DockerActionResult {
  ok: boolean
  error?: string
}
export interface DockerPruneResult {
  ok: boolean
  out?: string
  error?: string
}
