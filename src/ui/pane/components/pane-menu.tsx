import { buildPaneMenu } from '../pane.state'
import { createSwatchButton } from './swatch-button'
import { createMenuItem } from './menu-item'

// Per-pane options menu (anchored under the ⋯ button). Builds the .context-menu
// DOM from buildPaneMenu entries (swatch rows / labels / action items) and wires
// the dismiss-on-outside-click handler. Pure view; the action logic lives in
// buildPaneMenu (pane.state).
export function showPaneMenu(
  anchor: HTMLElement,
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): void {
  document.querySelector('.context-menu')?.remove()
  const menu = (<div class="context-menu" />) as HTMLDivElement
  const r = anchor.getBoundingClientRect()
  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px'
  menu.style.top = r.bottom + 4 + 'px'

  // Consecutive swatch entries share a single color-swatches row.
  let swatchRow: HTMLElement | null = null
  for (const e of buildPaneMenu(paneId, opts)) {
    if (e.kind === 'swatch') {
      if (!swatchRow) {
        swatchRow = (<div class="context-menu-swatches" />) as HTMLDivElement
        menu.appendChild(swatchRow)
      }
      swatchRow.appendChild(
        createSwatchButton({
          color: e.color,
          onClick: () => {
            menu.remove()
            e.run()
          }
        })
      )
      continue
    }
    swatchRow = null
    if (e.kind === 'label') {
      const lab = (<div class="context-menu-label">{e.text}</div>) as HTMLDivElement
      menu.appendChild(lab)
      continue
    }
    menu.appendChild(
      createMenuItem({
        label: e.label,
        onClick: () => {
          menu.remove()
          e.run()
        }
      })
    )
  }

  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}
