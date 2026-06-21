import { commandHistory, state } from '@ui/state/state'
import { selectPane } from '@ui/commands/commands'
import { terminalService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import type { PaletteCommand, OpenTerminal } from './command.types'
import {
  loadZshCommands,
  buildPaletteCommands,
  filterPaletteCommands,
  buildOpenTerminals,
  filterTerminals,
  filterHistory
} from './command.state'
import { paletteRow } from './components/palette-row'
import { terminalRow } from './components/terminal-row'
import { commandHistoryRow } from './components/command-history-row'
import { renderCategoryChips } from './components/category-chips'

export type { PaletteCommand, OpenTerminal, ZshCommand } from './command.types'
export { loadZshCommands } from './command.state'

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

export async function showCommandPalette(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = (<h2>{UITexts.Pickers.command.heading}</h2>) as HTMLHeadingElement
  const input = (
    <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.placeholder} />
  ) as HTMLInputElement
  input.spellcheck = false
  const chips = (<div class="md-filters palette-chips" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, chips, list)

  const { all, categories } = buildPaletteCommands(await loadZshCommands())
  const active = new Set<string>(['zsh']) // multi-select chips; zsh is the default

  let sel = 0
  const filtered = (): PaletteCommand[] => filterPaletteCommands(all, active, input.value)
  // Insert (don't run) the command into the active terminal so the user can edit it.
  const insert = (c: PaletteCommand): void => {
    const id = state.activePaneId
    if (id) {
      selectPane(id)
      terminalService.input(id, c.value)
    }
    close()
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.palette-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.slice(0, 500).forEach((c, i) => {
      list.appendChild(
        paletteRow({
          command: c,
          active: i === sel,
          onClick: () => insert(c),
          onHover: () => {
            sel = i
            highlight()
          }
        })
      )
    })
  }
  const renderChips = (): void => {
    renderCategoryChips({
      container: chips,
      categories,
      active,
      onToggle: (cat) => {
        if (active.has(cat)) {
          if (active.size > 1) active.delete(cat) // keep at least one category active
        } else {
          active.add(cat)
        }
        sel = 0
        renderChips()
        render()
      }
    })
  }
  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) insert(items[sel])
    }
  })
  renderChips()
  render()
  input.focus()
}

// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export function showTerminalSwitcher(): void {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = (<h2>{UITexts.Pickers.command.terminalsHeading}</h2>) as HTMLHeadingElement
  const input = (
    <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.terminalsPlaceholder} />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, list)

  const all = buildOpenTerminals()

  let sel = 0
  const filtered = (): OpenTerminal[] => filterTerminals(all, input.value)
  const focusTerm = (t: OpenTerminal): void => {
    selectPane(t.paneId)
    close()
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noTerminals}</div>`
      )
      return
    }
    items.forEach((t, i) => {
      list.appendChild(
        terminalRow({
          terminal: t,
          active: i === sel,
          onClick: () => focusTerm(t),
          onHover: () => {
            sel = i
            highlight()
          }
        })
      )
    })
  }
  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) focusTerm(items[sel])
    }
  })
  render()
  input.focus()
}

// ---- Command history: filter all app-tracked commands, copy one ----

export function showCommandHistory(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.command.historyHeading}</h2>) as HTMLHeadingElement
  const input = (
    <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.filterPlaceholder} />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, list)

  const all = [...commandHistory].reverse() // most recent first

  const render = (): void => {
    const items = filterHistory(all, input.value)
    list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">{commandHistory.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noCommands}</div>
      ) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((cmd) => {
      list.appendChild(commandHistoryRow({ command: cmd }))
    })
  }

  input.addEventListener('input', render)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  render()
  input.focus()
}
