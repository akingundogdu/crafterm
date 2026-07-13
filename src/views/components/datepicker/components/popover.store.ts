import { Store } from '@geajs/core'
import type { DateFieldMode, DateState, DayCell, FieldModel } from '../datepicker.types'
import { nowState } from '../datepicker.store'

// Per-instance reactive state for one calendar popover (a fresh CalendarStore is
// created on every openPopover, so two date fields never share month/selection —
// no global-singleton bleed). `viewY` / `viewM` / `selected` are the real reactive
// fields the popover body reads in template(), so gea re-renders the grid on month
// nav, day select and time change (the ssh lesson: read the actual fields, never a
// dead `void rev`). Each mutation also writes back the trigger's shared FieldModel
// so the button's native-like `value` getter and label stay in sync, and fires the
// `change` event via emitChange.
export class CalendarStore extends Store {
  viewY = 0
  viewM = 1
  selected: DateState | null = null

  readonly mode: DateFieldMode
  private readonly model: FieldModel
  private readonly emitChange: () => void
  private readonly syncText: () => void
  onClose: () => void = () => {}

  constructor(mode: DateFieldMode, model: FieldModel, emitChange: () => void, syncText: () => void) {
    super()
    this.mode = mode
    this.model = model
    this.emitChange = emitChange
    this.syncText = syncText
    const start = model.selected ? { ...model.selected } : nowState(mode)
    this.viewY = start.y
    this.viewM = start.m
    this.selected = model.selected
  }

  navMonth(delta: 1 | -1): void {
    let m = this.viewM + delta
    let y = this.viewY
    if (m < 1) {
      m = 12
      y--
    } else if (m > 12) {
      m = 1
      y++
    }
    this.viewM = m
    this.viewY = y
  }

  selectDay(cell: DayCell): void {
    const now = nowState(this.mode)
    const hh = this.selected?.hh ?? (this.mode === 'datetime' ? now.hh : 0)
    const mm = this.selected?.mm ?? (this.mode === 'datetime' ? now.mm : 0)
    this.commit({ y: cell.y, m: cell.m, d: cell.d, hh, mm })
    this.viewY = cell.y
    this.viewM = cell.m
    if (this.mode !== 'datetime') this.onClose()
  }

  setTimeFromInput(raw: string): void {
    const m = raw.match(/^(\d{2}):(\d{2})/)
    if (!m) return
    const base = this.selected ?? nowState(this.mode)
    this.commit({ ...base, hh: +m[1], mm: +m[2] })
  }

  clear(): void {
    this.commit(null)
    this.onClose()
  }

  today(): void {
    const now = nowState(this.mode)
    this.commit(now)
    this.viewY = now.y
    this.viewM = now.m
    if (this.mode !== 'datetime') this.onClose()
  }

  // Set the reactive selection AND the trigger's shared model, then notify.
  private commit(next: DateState | null): void {
    this.selected = next
    this.model.selected = next
    this.syncText()
    this.emitChange()
  }
}
