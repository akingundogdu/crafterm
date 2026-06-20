import type { DockerKind } from '@services/docker/docker.types'

// Docker resource detail modal types.

export interface EmbeddedTerm {
  dispose: () => void
}

export type DetailTab = 'inspect' | 'logs' | 'terminal'

export interface DetailModalOptions {
  kind: DockerKind
  id: string
  name: string
  running?: boolean
  initial?: DetailTab
}
