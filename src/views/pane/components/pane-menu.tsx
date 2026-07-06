import { Component } from '@geajs/core'
import { buildPaneMenu } from '../pane.state'
import type { PaneMenuEntry } from '../pane.types'

// The pane menu, pre-grouped into rows: consecutive swatch entries collapse into a
// single color-swatches row so gea can map rows one-to-one to DOM.
type MenuRow =
  | { type: 'swatches'; key: string; swatches: { color: string | null; run: () => void }[] }
  | { type: 'label'; key: string; text: string }
  | { type: 'item'; key: string; label: string; run: () => void }

function groupRows(entries: PaneMenuEntry[]): MenuRow[] {
  const rows: MenuRow[] = []
  let swatchRow: Extract<MenuRow, { type: 'swatches' }> | null = null
  entries.forEach((e, idx) => {
    if (e.kind === 'swatch') {
      if (!swatchRow) {
        swatchRow = { type: 'swatches', key: `sw${idx}`, swatches: [] }
        rows.push(swatchRow)
      }
      swatchRow.swatches.push({ color: e.color, run: e.run })
      return
    }
    swatchRow = null
    if (e.kind === 'label') rows.push({ type: 'label', key: `lb${idx}`, text: e.text })
    else rows.push({ type: 'item', key: `it${idx}`, label: e.label, run: e.run })
  })
  return rows
}

// Per-pane options menu (anchored under the ⋯ button). Maps the buildPaneMenu
// entries into the .context-menu DOM (swatch rows / labels / action items). The
// action row/item Components carry their own click handlers, so no raw handler
// sits on a nested element inside the keyed map. Data arrives via the constructor
// into plain fields — a gea Component only populates `this.props` when rendered
// from a parent template, not a manual `new X()`.
export default class PaneMenu extends Component {
  rootEl: HTMLElement | null = null
  private readonly rows: MenuRow[]
  private readonly closeFn: () => void

  constructor(opts: { paneId: string; menuOpts: { worktree?: boolean; bg?: boolean }; onClose: () => void }) {
    super()
    this.closeFn = opts.onClose
    this.rows = groupRows(buildPaneMenu(opts.paneId, opts.menuOpts))
  }

  private pick = (run: () => void): void => {
    this.closeFn()
    run()
  }

  template() {
    return (
      <div class="context-menu" ref={this.rootEl}>
        {this.rows.map((row) => {
          if (row.type === 'swatches') {
            // Inline intrinsic <button>s — a Component used inside a NESTED `.map()`
            // is mis-compiled by the gea plugin into a plain `jsx(Class)` call that
            // invokes the class without `new` (TypeError). Handler on the button
            // (map-item) ROOT is safe.
            return (
              <div key={row.key} class="context-menu-swatches">
                {row.swatches.map((s, i) => (
                  <button
                    key={`${row.key}:${i}`}
                    class={'context-menu-swatch' + (s.color === null ? ' context-menu-swatch-none' : '')}
                    title={s.color ? undefined : 'Default'}
                    style={s.color ? { background: s.color } : undefined}
                    onClick={() => this.pick(s.run)}
                  />
                ))}
              </div>
            )
          }
          if (row.type === 'label') {
            return (
              <div key={row.key} class="context-menu-label">
                {row.text}
              </div>
            )
          }
          return (
            <button key={row.key} onClick={() => this.pick(row.run)}>
              {row.label}
            </button>
          )
        })}
      </div>
    )
  }
}

// Opens the per-pane options menu anchored under the ⋯ button. The anchor rect is
// snapshotted at entry; the gea PaneMenu is rendered straight into <body> (NOT
// moved out of its render tree — that would break gea's event wiring) and
// dismissed on an outside mousedown.
export function showPaneMenu(
  anchor: HTMLElement,
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): void {
  document.querySelector('.context-menu')?.remove()
  const r = anchor.getBoundingClientRect()

  const comp = new PaneMenu({ paneId, menuOpts: opts, onClose: () => close() })
  comp.render(document.body)
  const menu = document.querySelector('.context-menu') as HTMLElement | null
  if (!menu) return

  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px'
  menu.style.top = r.bottom + 4 + 'px'

  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) close()
  }
  const close = (): void => {
    menu.remove()
    document.removeEventListener('mousedown', onDown, true)
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}
