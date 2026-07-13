// Custom date / datetime picker types.

export type DateFieldMode = 'date' | 'datetime'
export type DateField = HTMLButtonElement & { value: string }

export interface DateState {
  y: number
  m: number // 1-12
  d: number
  hh: number
  mm: number
}

// The single mutable selection shared by the trigger's `value` property, the
// label sync, and the popover.
export interface FieldModel {
  selected: DateState | null
}

// One rendered calendar cell's data (the view turns it into a button).
export interface DayCell {
  y: number
  m: number
  d: number
  muted: boolean // belongs to an adjacent month
  today: boolean
}

// Shared mutable context the popover's handlers read and write. The view owns the
// DOM + the render routines (`syncText`/`renderGrid`/`close`); state owns the
// handler bodies that mutate this context and call those routines.
export interface PopoverContext {
  mode: DateFieldMode
  model: FieldModel
  viewY: number
  viewM: number
  timeInput: HTMLInputElement | null
  syncText: () => void
  emitChange: () => void
  renderGrid: () => void
  close: () => void
}
