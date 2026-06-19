// Docker domain data models (moved out of the former bridge api.d.ts).
export type DockerKind = 'container' | 'image' | 'volume' | 'network'

// Docker CLI tokens — subcommands, action verbs, flags, and Go-template format
// strings — centralized so the handlers in docker.main.ts read from one source
// instead of inline string literals.
export const DockerCli = {
  Sub: {
    Version: 'version',
    Ps: 'ps',
    Images: 'images',
    Volume: 'volume',
    Network: 'network',
    Compose: 'compose',
    Stats: 'stats',
    Image: 'image',
    Container: 'container',
    Inspect: 'inspect',
    Logs: 'logs',
    Ls: 'ls',
    Rm: 'rm',
    Rmi: 'rmi',
    Prune: 'prune'
  },
  Action: {
    Start: 'start',
    Stop: 'stop',
    Restart: 'restart',
    Pause: 'pause',
    Unpause: 'unpause',
    Down: 'down',
    Remove: 'remove'
  },
  Flag: {
    Format: '--format',
    All: '--all',
    AllShort: '-a',
    Force: '-f',
    File: '-f', // `docker compose -f <file>` (compose file selector, not --force)
    NoTrunc: '--no-trunc',
    NoStream: '--no-stream',
    Tail: '--tail'
  },
  Format: {
    Json: '{{json .}}',
    ComposeJson: 'json',
    ServerVersion: '{{.Server.Version}}'
  }
} as const

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
