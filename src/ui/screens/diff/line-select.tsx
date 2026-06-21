import type { LineRow, LineSelectOptions, LineSelectHandle } from './line-select.types'
import { buildRef } from './line-select.state'
import { createSelectionEngine } from './selection.engine'
import { createDiffRow } from './components/diff-row'
import { createActionCluster } from './components/action-cluster'

export type { LineRow, LineSelectOptions, LineSelectHandle } from './line-select.types'

// Shared line-selection engine for the read-only file/diff viewer panes. Owns the
// `.diff-body` element, the rendered rows, contiguous range selection
// (click / click-drag / shift-click), font scaling, and the floating action
// cluster whose "+" pastes a `path:line[-line]` reference into a terminal.
//
// Pure: it imports no state/IPC — the app touchpoints (which file the ref names,
// how to paste it, pane selection) arrive via opts, so the engine renders and
// selects under happy-dom without the renderer graph. Callers (file-pane,
// diff-pane) supply the row list and wire the injected callbacks. The selection
// state machine is intentionally closure-bound; pure helpers live in state.
export function createLineSelect(opts: LineSelectOptions): LineSelectHandle {
  const body = (<div class="diff-body" />) as HTMLDivElement

  const rows: HTMLElement[] = [] // selectable rows, in order

  const currentRef = (): string | null => {
    if (selection.selStart() < 0) return null
    const file = opts.refFile()
    if (!file) return null
    const a = Number(rows[selection.selStart()].dataset.line)
    const b = Number(rows[selection.selEnd()].dataset.line)
    return buildRef(file, a, b)
  }

  const cluster = createActionCluster({
    extraActions: opts.extraActions,
    currentRef,
    sendRef: opts.sendRef
  })

  // Anchor the action cluster to the first selected row (rides scroll because
  // it's a child of that row).
  const positionPlus = (): void => {
    if (selection.selStart() < 0) {
      cluster.hide()
      opts.onSelectionCleared?.()
      return
    }
    cluster.anchorTo(rows[selection.selStart()])
  }

  const selection = createSelectionEngine({
    rows,
    applyFont: (fontSize) => {
      body.style.fontSize = fontSize + 'px'
    },
    onSelectionChange: positionPlus
  })

  const currentRange = (): { a: number; b: number } | null => {
    if (selection.selStart() < 0) return null
    return {
      a: Number(rows[selection.selStart()].dataset.line),
      b: Number(rows[selection.selEnd()].dataset.line)
    }
  }

  const setRows = (descs: LineRow[]): void => {
    body.replaceChildren()
    rows.length = 0
    selection.clearSelection()
    for (const d of descs) {
      const idx = rows.length
      const row = createDiffRow({
        desc: d,
        onMouseDown: (e) => {
          e.preventDefault()
          e.stopPropagation()
          opts.onRowSelect()
          if (e.shiftKey && selection.anchor() >= 0) {
            selection.extendTo(idx)
          } else {
            selection.beginDrag(idx)
          }
        },
        onMouseEnter: () => {
          if (selection.isDragging() && selection.anchor() >= 0) selection.extendTo(idx)
        }
      })
      if (d.line != null) rows.push(row)
      body.appendChild(row)
    }
  }

  const setMessage = (msg: string): void => {
    body.replaceChildren()
    rows.length = 0
    selection.clearSelection()
    body.textContent = msg
  }

  // drag ends anywhere
  const onUp = (): void => {
    selection.endDrag()
  }
  document.addEventListener('mouseup', onUp)

  return {
    body,
    setRows,
    setMessage,
    clearSelection: selection.clearSelection,
    currentRange,
    setFont: selection.setFont,
    resetFont: selection.resetFont,
    destroy: () => {
      document.removeEventListener('mouseup', onUp)
    }
  }
}
