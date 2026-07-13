import { Component } from '@geajs/core'
import type { ContextMenuItem as ContextMenuItemData } from '../context-menu.types'
import { makeLeafClick } from '../context-menu.store'
import { makeSubmenuOpen, type RenderMenu } from './context-menu-submenu'

// One item button. A parent (has `children`) opens a flyout to the right on
// hover/click; a leaf runs its action via makeLeafClick (with reopen so a keepOpen
// item can re-open its submenu). Rendered directly into the menu host so its gea
// tree is rooted there and survives the container's move into <body>. Data comes
// via the constructor into plain fields — a gea Component only populates
// `this.props` when rendered from a parent template, never a manual `new X()`.
// Self-contained — no @ui (§2.7).
export default class ContextMenuItem extends Component {
  rootEl: HTMLElement | null = null
  private started = false
  private open: (() => void) | null = null
  private readonly item: ContextMenuItemData
  private readonly menu: HTMLDivElement
  private readonly depth: number
  private readonly renderMenu: RenderMenu
  private readonly reopen?: () => void

  constructor(opts: {
    item: ContextMenuItemData
    menu: HTMLDivElement
    depth: number
    renderMenu: RenderMenu
    reopen?: () => void
  }) {
    super()
    this.item = opts.item
    this.menu = opts.menu
    this.depth = opts.depth
    this.renderMenu = opts.renderMenu
    this.reopen = opts.reopen
  }

  // A parent item's flyout opener needs its own button rect, so it is wired once
  // the button node exists (refs are assigned around onAfterRender, not right after
  // render()).
  onAfterRender(): void {
    if (this.started) return
    this.started = true
    if (this.item.children && this.rootEl) {
      this.open = makeSubmenuOpen(this.item, this.menu, this.rootEl as HTMLButtonElement, this.depth, this.renderMenu)
    }
  }

  template() {
    const hasChildren = !!this.item.children
    // A leaf doesn't close the open submenu on hover — that would shut the flyout
    // the user is diagonally reaching for. It closes when another parent opens, a
    // leaf is clicked, or the user clicks outside.
    return (
      <button
        ref={this.rootEl}
        class={this.item.danger ? 'context-menu-danger' : undefined}
        onMouseEnter={hasChildren ? () => void this.open?.() : undefined}
        onClick={
          hasChildren
            ? (e: MouseEvent) => {
                e.stopPropagation()
                void this.open?.()
              }
            : makeLeafClick(this.item, this.reopen)
        }
      >
        {hasChildren ? `${this.item.label}  ▸` : this.item.label}
      </button>
    )
  }
}

// Renders one item button into the menu host. A parent (has `children`) opens a
// flyout to the right on hover/click; a leaf runs its action.
export function createContextMenuItem(
  item: ContextMenuItemData,
  menu: HTMLDivElement,
  depth: number,
  renderMenu: RenderMenu,
  reopen?: () => void
): void {
  new ContextMenuItem({ item, menu, depth, renderMenu, reopen }).render(menu)
}
