import type { DateFieldMode, DateState, DateField, FieldModel, DayCell, PopoverContext } from './datepicker.types'

export const CAL_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5"/></svg>'

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Parse a stored value into state, or null when empty/invalid.
// date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:mm'.
export function parseValue(mode: DateFieldMode, raw: string): DateState | null {
  const str = raw.trim()
  if (!str) return null
  const [datePart, timePart] = str.split('T')
  const dm = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dm) return null
  const state: DateState = { y: +dm[1], m: +dm[2], d: +dm[3], hh: 0, mm: 0 }
  if (mode === 'datetime' && timePart) {
    const tm = timePart.match(/^(\d{2}):(\d{2})/)
    if (tm) {
      state.hh = +tm[1]
      state.mm = +tm[2]
    }
  }
  return state
}

// State → stored value string (the format the call site reads back).
export function serialize(mode: DateFieldMode, s: DateState): string {
  const date = `${s.y}-${pad2(s.m)}-${pad2(s.d)}`
  return mode === 'datetime' ? `${date}T${pad2(s.hh)}:${pad2(s.mm)}` : date
}

// State → human-readable label shown on the trigger.
export function displayLabel(mode: DateFieldMode, s: DateState): string {
  const date = `${pad2(s.d)}.${pad2(s.m)}.${s.y}`
  return mode === 'datetime' ? `${date} ${pad2(s.hh)}:${pad2(s.mm)}` : date
}

export function nowState(mode: DateFieldMode): DateState {
  const d = new Date()
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    hh: mode === 'datetime' ? d.getHours() : 0,
    mm: mode === 'datetime' ? d.getMinutes() : 0
  }
}

function sameDay(s: DateState, y: number, m: number, d: number): boolean {
  return s.y === y && s.m === m && s.d === d
}

// True when the cell's day matches the current selection (drives the highlight).
export function isSelectedCell(model: FieldModel, cell: DayCell): boolean {
  return !!model.selected && sameDay(model.selected, cell.y, cell.m, cell.d)
}

export function placeholderFor(mode: DateFieldMode): string {
  return mode === 'datetime' ? 'Pick date & time' : 'Pick a date'
}

export function timeValue(s: DateState): string {
  return `${pad2(s.hh)}:${pad2(s.mm)}`
}

// The 42 cells of a Monday-based month grid (6 weeks), including the muted
// adjacent-month days and a `today` flag.
export function buildMonthCells(viewY: number, viewM: number): DayCell[] {
  const first = new Date(viewY, viewM - 1, 1)
  const offset = (first.getDay() + 6) % 7 // Monday-based
  const today = new Date()
  const start = -offset
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const cur = new Date(viewY, viewM - 1, start + i + 1)
    const cy = cur.getFullYear()
    const cm = cur.getMonth() + 1
    const cd = cur.getDate()
    cells.push({
      y: cy,
      m: cm,
      d: cd,
      muted: cm !== viewM,
      today: cy === today.getFullYear() && cm === today.getMonth() + 1 && cd === today.getDate()
    })
  }
  return cells
}

// Mirrors the native input API: a `value` property (get/set) in the stored format.
export function defineValueProp(
  btn: DateField,
  mode: DateFieldMode,
  model: FieldModel,
  syncText: () => void
): void {
  Object.defineProperty(btn, 'value', {
    get(): string {
      return model.selected ? serialize(mode, model.selected) : ''
    },
    set(v: string): void {
      model.selected = parseValue(mode, v ?? '')
      syncText()
    }
  })
}

export function dispatchChange(btn: DateField): void {
  btn.dispatchEvent(new Event('change'))
}

// Anchor the popover under the trigger, clamped to the viewport.
export function positionPopover(pop: HTMLElement, btn: HTMLElement): void {
  const r = btn.getBoundingClientRect()
  const w = pop.offsetWidth
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'
  const below = r.bottom + 6
  if (below + pop.offsetHeight > window.innerHeight - 8) {
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px'
  } else {
    pop.style.top = below + 'px'
  }
}

// ---- Event handlers (bodies live here; the view only binds them) -----------

export function makeTriggerClick(open: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    open()
  }
}

export function stopMousedown(e: MouseEvent): void {
  e.stopPropagation()
}

export function makeMonthNav(delta: 1 | -1, ctx: PopoverContext): () => void {
  return () => {
    ctx.viewM += delta
    if (ctx.viewM < 1) {
      ctx.viewM = 12
      ctx.viewY--
    } else if (ctx.viewM > 12) {
      ctx.viewM = 1
      ctx.viewY++
    }
    ctx.renderGrid()
  }
}

export function makeCellClick(cell: DayCell, ctx: PopoverContext): () => void {
  return () => {
    const now = nowState(ctx.mode)
    const hh = ctx.model.selected?.hh ?? (ctx.mode === 'datetime' ? now.hh : 0)
    const mm = ctx.model.selected?.mm ?? (ctx.mode === 'datetime' ? now.mm : 0)
    ctx.model.selected = { y: cell.y, m: cell.m, d: cell.d, hh, mm }
    ctx.viewY = cell.y
    ctx.viewM = cell.m
    ctx.syncText()
    ctx.emitChange()
    if (ctx.mode === 'datetime') {
      ctx.renderGrid()
      if (ctx.timeInput) ctx.timeInput.value = timeValue(ctx.model.selected)
    } else {
      ctx.close()
    }
  }
}

export function makeTimeInput(ctx: PopoverContext, input: HTMLInputElement): () => void {
  return () => {
    const m = input.value.match(/^(\d{2}):(\d{2})/)
    if (!m) return
    if (!ctx.model.selected) ctx.model.selected = { ...nowState(ctx.mode), hh: +m[1], mm: +m[2] }
    else ctx.model.selected = { ...ctx.model.selected, hh: +m[1], mm: +m[2] }
    ctx.syncText()
    ctx.emitChange()
  }
}

export function makeClearClick(ctx: PopoverContext): () => void {
  return () => {
    ctx.model.selected = null
    ctx.syncText()
    ctx.emitChange()
    ctx.close()
  }
}

export function makeTodayClick(ctx: PopoverContext): () => void {
  return () => {
    ctx.model.selected = nowState(ctx.mode)
    ctx.viewY = ctx.model.selected.y
    ctx.viewM = ctx.model.selected.m
    ctx.syncText()
    ctx.emitChange()
    if (ctx.mode === 'datetime') {
      ctx.renderGrid()
      if (ctx.timeInput) ctx.timeInput.value = timeValue(ctx.model.selected)
    } else {
      ctx.close()
    }
  }
}

export function makeOutsideDown(pop: HTMLElement, btn: HTMLElement, close: () => void): (e: MouseEvent) => void {
  return (ev) => {
    if (!pop.contains(ev.target as Node) && ev.target !== btn) close()
  }
}

export function makeEscapeKey(close: () => void): (e: KeyboardEvent) => void {
  return (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      close()
    }
  }
}
