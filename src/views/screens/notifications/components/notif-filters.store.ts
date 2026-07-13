import type { NotifKindFilter } from '../notifications.types'

// The status chips above the Alerts list. 'all' is the default (no filter).
export const KIND_CHIPS: { id: NotifKindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'question', label: 'Question' },
  { id: 'done', label: 'Done' },
  { id: 'reminder', label: 'Reminder' }
]

export const ALL_PROJECTS_LABEL = 'All projects'
