import type { Section } from './todo-doc'

// A single backlog/ready/progress row resolved against its owning section, so a
// handler can mutate the section's `items` array in place by index.
export interface Entry {
  section: Section
  idx: number
  text: string
  inProgress?: boolean
}

// A row's trailing action button: icon glyph, tooltip, optional extra class,
// and the work it performs when clicked.
export interface RowAction {
  icon: string
  title: string
  cls?: string
  run: () => void | Promise<void>
}
