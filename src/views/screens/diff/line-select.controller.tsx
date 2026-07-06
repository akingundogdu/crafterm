import { Component } from '@geajs/core'
import type { LineRow, LineSelectOptions, LineSelectHandle } from './line-select.types'
import { buildRef } from './line-select.state'
import { createSelectionEngine } from './selection.engine'
import { createDiffRow } from './components/diff-row'
import { createActionCluster } from './components/action-cluster'

// The scrollable `.diff-body` container, as a gea Component. The controller reads
// the rendered node and drives the rows imperatively (replaceChildren / append).
class DiffBodyView extends Component {
  template() {
    return <div class="diff-body" />
  }
}

function createDiffBody(): HTMLDivElement {
  const host = document.createElement('div')
  new DiffBodyView().render(host)
  return host.firstElementChild as HTMLDivElement
}

// Shared line-selection engine for the read-only file/diff viewer panes. Owns the
// `.diff-body` element, the rendered rows, contiguous range selection
// (click / click-drag / shift-click), font scaling, and the floating action
// cluster whose "+" pastes a `path:line[-line]` reference into a terminal.
//
// Pure: it imports no state/IPC — the app touchpoints (which file the ref names,
// how to paste it, pane selection) arrive via opts, so the engine renders and
// selects under happy-dom without the renderer graph. Callers (file-pane,
// diff-pane) supply the row list and wire the injected callbacks. The selection
// state machine is intentionally closure-bound; the constructor builds + wires,
// build() returns the handle.
export class LineSelectController {
  private readonly opts: LineSelectOptions
  private readonly body: HTMLDivElement
  private readonly rows: HTMLElement[] = [] // selectable rows, in order
  private readonly cluster: ReturnType<typeof createActionCluster>
  private readonly selection: ReturnType<typeof createSelectionEngine>

  constructor(opts: LineSelectOptions) {
    this.opts = opts
    this.body = createDiffBody()

    this.cluster = createActionCluster({
      extraActions: opts.extraActions,
      currentRef: this.currentRef,
      sendRef: opts.sendRef
    })

    this.selection = createSelectionEngine({
      rows: this.rows,
      applyFont: (fontSize) => {
        this.body.style.fontSize = fontSize + 'px'
      },
      onSelectionChange: this.positionPlus
    })

    // drag ends anywhere
    document.addEventListener('mouseup', this.onUp)
  }

  build(): LineSelectHandle {
    return {
      body: this.body,
      setRows: this.setRows,
      setMessage: this.setMessage,
      clearSelection: this.selection.clearSelection,
      currentRange: this.currentRange,
      setFont: this.selection.setFont,
      resetFont: this.selection.resetFont,
      destroy: () => {
        document.removeEventListener('mouseup', this.onUp)
      }
    }
  }

  private currentRef = (): string | null => {
    if (this.selection.selStart() < 0) return null
    const file = this.opts.refFile()
    if (!file) return null
    const a = Number(this.rows[this.selection.selStart()].dataset.line)
    const b = Number(this.rows[this.selection.selEnd()].dataset.line)
    return buildRef(file, a, b)
  }

  // Anchor the action cluster to the first selected row (rides scroll because
  // it's a child of that row).
  private positionPlus = (): void => {
    if (this.selection.selStart() < 0) {
      this.cluster.hide()
      this.opts.onSelectionCleared?.()
      return
    }
    this.cluster.anchorTo(this.rows[this.selection.selStart()])
  }

  private currentRange = (): { a: number; b: number } | null => {
    if (this.selection.selStart() < 0) return null
    return {
      a: Number(this.rows[this.selection.selStart()].dataset.line),
      b: Number(this.rows[this.selection.selEnd()].dataset.line)
    }
  }

  private setRows = (descs: LineRow[]): void => {
    this.body.replaceChildren()
    this.rows.length = 0
    this.selection.clearSelection()
    for (const d of descs) {
      const idx = this.rows.length
      const row = createDiffRow({
        desc: d,
        onMouseDown: (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.opts.onRowSelect()
          if (e.shiftKey && this.selection.anchor() >= 0) {
            this.selection.extendTo(idx)
          } else {
            this.selection.beginDrag(idx)
          }
        },
        onMouseEnter: () => {
          if (this.selection.isDragging() && this.selection.anchor() >= 0) this.selection.extendTo(idx)
        }
      })
      if (d.line != null) this.rows.push(row)
      this.body.appendChild(row)
    }
  }

  private setMessage = (msg: string): void => {
    this.body.replaceChildren()
    this.rows.length = 0
    this.selection.clearSelection()
    this.body.textContent = msg
  }

  private onUp = (): void => {
    this.selection.endDrag()
  }
}
