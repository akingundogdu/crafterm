// A themed, dependency-free replacement for native <input type="date"> and
// <input type="datetime-local">. The native calendar popup can't be styled to
// match the app, so this renders the field as a trigger button and a custom
// popover calendar. The returned element mimics the native input API: a `value`
// property (get/set) in the same string format and a `change` event on user
// selection, so existing call sites stay drop-in.

import './datepicker.css'

const CAL_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5"/></svg>'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export type DateFieldMode = 'date' | 'datetime'
export type DateField = HTMLButtonElement & { value: string }

interface DateState {
  y: number
  m: number // 1-12
  d: number
  hh: number
  mm: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Parse a stored value into state, or null when empty/invalid.
// date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:mm'.
function parseValue(mode: DateFieldMode, raw: string): DateState | null {
  const str = raw.trim()
  if (!str) return null
  const [datePart, timePart] = str.split('T')
  const dm = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dm) return null
  const state: DateState = {
    y: +dm[1],
    m: +dm[2],
    d: +dm[3],
    hh: 0,
    mm: 0
  }
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
function serialize(mode: DateFieldMode, s: DateState): string {
  const date = `${s.y}-${pad2(s.m)}-${pad2(s.d)}`
  return mode === 'datetime' ? `${date}T${pad2(s.hh)}:${pad2(s.mm)}` : date
}

// State → human-readable label shown on the trigger.
function displayLabel(mode: DateFieldMode, s: DateState): string {
  const date = `${pad2(s.d)}.${pad2(s.m)}.${s.y}`
  return mode === 'datetime' ? `${date} ${pad2(s.hh)}:${pad2(s.mm)}` : date
}

function nowState(mode: DateFieldMode): DateState {
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

export function createDateField(opts: {
  mode: DateFieldMode
  value?: string
  className?: string
}): DateField {
  const { mode } = opts
  const text = (<span class="datepicker-field-text" />) as HTMLSpanElement
  const btn = (
    <button
      type="button"
      class={'datepicker-field' + (opts.className ? ` ${opts.className}` : '')}
    >
      {text}
      <span class="datepicker-field-glyph" innerHTML={CAL_SVG} />
    </button>
  ) as DateField

  let selected: DateState | null = parseValue(mode, opts.value ?? '')

  const placeholder = mode === 'datetime' ? 'Pick date & time' : 'Pick a date'
  const syncText = (): void => {
    if (selected) {
      text.textContent = displayLabel(mode, selected)
      text.classList.remove('datepicker-field-empty')
    } else {
      text.textContent = placeholder
      text.classList.add('datepicker-field-empty')
    }
  }
  syncText()

  Object.defineProperty(btn, 'value', {
    get(): string {
      return selected ? serialize(mode, selected) : ''
    },
    set(v: string): void {
      selected = parseValue(mode, v ?? '')
      syncText()
    }
  })

  const emitChange = (): void => {
    btn.dispatchEvent(new Event('change'))
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    openPopover()
  })

  // ---- Popover ---------------------------------------------------------
  function openPopover(): void {
    document.querySelector('.datepicker-pop')?.remove()

    const view = selected ? { ...selected } : nowState(mode)
    let viewY = view.y
    let viewM = view.m

    const monthLabel = (<span class="datepicker-pop-month" />) as HTMLSpanElement
    const prev = (<button class="datepicker-pop-nav">‹</button>) as HTMLButtonElement
    const next = (<button class="datepicker-pop-nav">›</button>) as HTMLButtonElement
    const head = (
      <div class="datepicker-pop-head">
        {prev}
        {monthLabel}
        {next}
      </div>
    ) as HTMLDivElement

    const weekRow = (
      <div class="datepicker-pop-week">
        {WEEKDAYS.map((w) => <span>{w}</span>)}
      </div>
    ) as HTMLDivElement

    const grid = (<div class="datepicker-pop-grid" />) as HTMLDivElement

    let timeInput: HTMLInputElement | null = null

    const renderGrid = (): void => {
      monthLabel.textContent = `${MONTHS[viewM - 1]} ${viewY}`
      grid.innerHTML = ''
      const first = new Date(viewY, viewM - 1, 1)
      const offset = (first.getDay() + 6) % 7 // Monday-based
      const daysInMonth = new Date(viewY, viewM, 0).getDate()
      const today = new Date()
      const start = -offset
      for (let i = 0; i < 42; i++) {
        const cell = document.createElement('button')
        cell.className = 'datepicker-pop-cell'
        const cur = new Date(viewY, viewM - 1, start + i + 1)
        const cy = cur.getFullYear()
        const cm = cur.getMonth() + 1
        const cd = cur.getDate()
        cell.textContent = String(cd)
        if (cm !== viewM) cell.classList.add('datepicker-pop-cell-muted')
        if (cy === today.getFullYear() && cm === today.getMonth() + 1 && cd === today.getDate()) {
          cell.classList.add('datepicker-pop-cell-today')
        }
        if (selected && sameDay(selected, cy, cm, cd)) cell.classList.add('datepicker-pop-cell-selected')
        cell.addEventListener('click', () => {
          const hh = selected?.hh ?? (mode === 'datetime' ? nowState(mode).hh : 0)
          const mm = selected?.mm ?? (mode === 'datetime' ? nowState(mode).mm : 0)
          selected = { y: cy, m: cm, d: cd, hh, mm }
          viewY = cy
          viewM = cm
          syncText()
          emitChange()
          if (mode === 'datetime') {
            renderGrid()
            if (timeInput) timeInput.value = `${pad2(selected.hh)}:${pad2(selected.mm)}`
          } else {
            close()
          }
        })
        grid.appendChild(cell)
      }
    }

    prev.addEventListener('click', () => {
      viewM--
      if (viewM < 1) {
        viewM = 12
        viewY--
      }
      renderGrid()
    })
    next.addEventListener('click', () => {
      viewM++
      if (viewM > 12) {
        viewM = 1
        viewY++
      }
      renderGrid()
    })

    const pop = (<div class="datepicker-pop" />) as HTMLDivElement
    pop.addEventListener('mousedown', (e) => e.stopPropagation())

    pop.append(head, weekRow, grid)

    if (mode === 'datetime') {
      timeInput = (
        <input type="time" class="datepicker-pop-time-input" />
      ) as HTMLInputElement
      timeInput.value = selected ? `${pad2(selected.hh)}:${pad2(selected.mm)}` : ''
      timeInput.addEventListener('input', () => {
        const m = timeInput!.value.match(/^(\d{2}):(\d{2})/)
        if (!m) return
        if (!selected) selected = { ...nowState(mode), hh: +m[1], mm: +m[2] }
        else selected = { ...selected, hh: +m[1], mm: +m[2] }
        syncText()
        emitChange()
      })
      const timeRow = (
        <div class="datepicker-pop-time">
          <span>Time</span>
          {timeInput}
        </div>
      ) as HTMLDivElement
      pop.appendChild(timeRow)
    }

    const clearBtn = (<button class="datepicker-pop-foot-btn">Clear</button>) as HTMLButtonElement
    clearBtn.addEventListener('click', () => {
      selected = null
      syncText()
      emitChange()
      close()
    })
    const todayBtn = (
      <button class="datepicker-pop-foot-btn datepicker-pop-foot-btn-accent">
        {mode === 'datetime' ? 'Now' : 'Today'}
      </button>
    ) as HTMLButtonElement
    todayBtn.addEventListener('click', () => {
      selected = nowState(mode)
      viewY = selected.y
      viewM = selected.m
      syncText()
      emitChange()
      if (mode === 'datetime') {
        renderGrid()
        if (timeInput) timeInput.value = `${pad2(selected.hh)}:${pad2(selected.mm)}`
      } else {
        close()
      }
    })
    const foot = (
      <div class="datepicker-pop-foot">
        {clearBtn}
        {todayBtn}
      </div>
    ) as HTMLDivElement
    pop.appendChild(foot)

    renderGrid()
    document.body.appendChild(pop)

    // Anchor under the trigger, clamped to the viewport.
    const r = btn.getBoundingClientRect()
    const w = pop.offsetWidth
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'
    const below = r.bottom + 6
    if (below + pop.offsetHeight > window.innerHeight - 8) {
      pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px'
    } else {
      pop.style.top = below + 'px'
    }

    const onDown = (ev: MouseEvent): void => {
      if (!pop.contains(ev.target as Node) && ev.target !== btn) close()
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        close()
      }
    }
    function close(): void {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      pop.remove()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
  }

  return btn
}
