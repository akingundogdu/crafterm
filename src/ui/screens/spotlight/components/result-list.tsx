import type { SpotSource, SpotEntry, ResultListHandle } from './result-list.types'
import { ResultListController } from './result-list.controller'

export type { SpotSource, SpotEntry, ResultListHandle } from './result-list.types'

export function createResultList(opts: {
  onChoose: (e: SpotEntry) => void
  badgeFor: (source: SpotSource) => string
}): ResultListHandle {
  return new ResultListController(opts).build()
}
