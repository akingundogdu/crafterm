// Shared line-selection engine for the read-only file/diff viewer panes. Owns the
// `.diff-body` element, the rendered rows, contiguous range selection
// (click / click-drag / shift-click), font scaling, and the floating action
// cluster whose "+" pastes a `path:line[-line]` reference into a terminal.
//
// Pure: it imports no state/IPC — the app touchpoints (which file the ref names,
// how to paste it, pane selection) arrive via opts, so the engine renders and
// selects under happy-dom without the renderer graph. Callers (file-pane,
// diff-pane) supply the row list and wire the injected callbacks.

const DEFAULT_FONT = 12
const MIN_FONT = 8
const MAX_FONT = 28

export interface LineRow {
  className: string // full row class, e.g. 'diff-row ctx' or 'diff-row add'
  gutter: string // gutter text (line number or empty)
  text: string // line content
  line: number | null // selectable when non-null; also set as dataset.line
}

export interface LineSelectOptions {
  // File path used to build the `path:line` ref (null suppresses the send).
  refFile: () => string | null
  // Paste the ref into a terminal; returns false when none is available.
  sendRef: (ref: string) => boolean
  // Called on row mousedown so the caller can mark its pane active.
  onRowSelect: () => void
  // Extra buttons appended into the floating cluster after the "+" (e.g. comment).
  extraActions?: HTMLElement[]
  // Fired when the selection becomes empty (e.g. to dismiss a popover).
  onSelectionCleared?: () => void
}

export interface LineSelectHandle {
  body: HTMLDivElement
  setRows: (rows: LineRow[]) => void
  setMessage: (msg: string) => void
  clearSelection: () => void
  currentRange: () => { a: number; b: number } | null
  setFont: (delta: number) => void
  resetFont: () => void
  destroy: () => void
}

export function createLineSelect(opts: LineSelectOptions): LineSelectHandle {
  const body = document.createElement('div')
  body.className = 'diff-body'

  // Floating action cluster anchored to the first selected row (left side).
  const actions = document.createElement('div')
  actions.className = 'diff-actions'
  actions.style.display = 'none'
  const plus = document.createElement('button')
  plus.className = 'diff-act diff-act-term'
  plus.textContent = '+'
  plus.title = 'Send this reference to the terminal'
  actions.append(plus, ...(opts.extraActions ?? []))

  let fontSize = DEFAULT_FONT
  const rows: HTMLElement[] = [] // selectable rows, in order
  let anchor = -1
  let selStart = -1
  let selEnd = -1
  let dragging = false

  const applyFont = (): void => {
    body.style.fontSize = fontSize + 'px'
  }
  applyFont()

  const currentRef = (): string | null => {
    if (selStart < 0) return null
    const file = opts.refFile()
    if (!file) return null
    const a = Number(rows[selStart].dataset.line)
    const b = Number(rows[selEnd].dataset.line)
    return a === b ? `${file}:${a}` : `${file}:${a}-${b}`
  }

  const currentRange = (): { a: number; b: number } | null => {
    if (selStart < 0) return null
    return { a: Number(rows[selStart].dataset.line), b: Number(rows[selEnd].dataset.line) }
  }

  const send = (): void => {
    const ref = currentRef()
    if (!ref) return
    if (!opts.sendRef(ref)) {
      plus.classList.add('warn')
      plus.title = 'Open a terminal first'
    }
  }
  plus.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  plus.addEventListener('click', (e) => {
    e.stopPropagation()
    send()
  })

  // Anchor the action cluster to the first selected row (rides scroll because
  // it's a child of that row).
  const positionPlus = (): void => {
    if (selStart < 0) {
      actions.style.display = 'none'
      if (actions.parentElement) actions.remove()
      opts.onSelectionCleared?.()
      return
    }
    rows[selStart].appendChild(actions)
    plus.classList.remove('warn')
    plus.title = 'Send this reference to the terminal'
    actions.style.display = ''
  }

  const refreshSelection = (): void => {
    rows.forEach((r, i) => r.classList.toggle('selected', i >= selStart && i <= selEnd))
    positionPlus()
  }

  const setSelection = (a: number, b: number): void => {
    selStart = Math.min(a, b)
    selEnd = Math.max(a, b)
    refreshSelection()
  }

  const clearSelection = (): void => {
    anchor = selStart = selEnd = -1
    refreshSelection()
  }

  const setRows = (descs: LineRow[]): void => {
    body.replaceChildren()
    rows.length = 0
    clearSelection()
    for (const d of descs) {
      const row = document.createElement('div')
      row.className = d.className
      const gutter = document.createElement('span')
      gutter.className = 'diff-gutter'
      gutter.textContent = d.gutter
      const text = document.createElement('span')
      text.className = 'diff-text'
      text.textContent = d.text
      row.append(gutter, text)
      if (d.line != null) {
        row.dataset.line = String(d.line)
        const idx = rows.length
        rows.push(row)
        row.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          opts.onRowSelect()
          if (e.shiftKey && anchor >= 0) {
            setSelection(anchor, idx)
          } else {
            anchor = idx
            dragging = true
            setSelection(idx, idx)
          }
        })
        row.addEventListener('mouseenter', () => {
          if (dragging && anchor >= 0) setSelection(anchor, idx)
        })
      }
      body.appendChild(row)
    }
  }

  const setMessage = (msg: string): void => {
    body.replaceChildren()
    rows.length = 0
    clearSelection()
    body.textContent = msg
  }

  // drag ends anywhere
  const onUp = (): void => {
    dragging = false
  }
  document.addEventListener('mouseup', onUp)

  return {
    body,
    setRows,
    setMessage,
    clearSelection,
    currentRange,
    setFont: (delta: number) => {
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, fontSize + delta))
      applyFont()
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      applyFont()
    },
    destroy: () => {
      document.removeEventListener('mouseup', onUp)
    }
  }
}
