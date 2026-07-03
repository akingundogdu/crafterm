import { Store } from '@geajs/core'
import type { OpenTerminal, PaletteCommand } from './command.types'

// Reactive state for the three command pickers. Every field the views render (the
// list, the search, the selection index, the palette's active categories) is a
// real reactive Store field the template READS AND USES, so gea patches the DOM on
// every keystroke / arrow-key move / chip toggle — the ssh/folder pattern. A bare
// `rev` counter read via `void store.rev` is NOT tracked by the gea compiler, so
// each mutation reassigns one of these fields (never a dead bump).

class TerminalSwitcherStore extends Store {
  all: OpenTerminal[] = []
  search = ''
  sel = 0

  reset(all: OpenTerminal[]): void {
    this.all = all
    this.search = ''
    this.sel = 0
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }
}

class CommandHistoryStore extends Store {
  all: string[] = []
  search = ''

  reset(all: string[]): void {
    this.all = all
    this.search = ''
  }

  setSearch(search: string): void {
    this.search = search
  }
}

class CommandPaletteStore extends Store {
  all: PaletteCommand[] = []
  categories: string[] = []
  active: Set<string> = new Set(['zsh']) // multi-select chips; zsh is the default
  search = ''
  sel = 0

  reset(): void {
    this.all = []
    this.categories = []
    this.active = new Set(['zsh'])
    this.search = ''
    this.sel = 0
  }

  setData(all: PaletteCommand[], categories: string[]): void {
    this.all = all
    this.categories = categories
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  // Toggle a category; reassign a fresh Set so the read in the view re-fires (an
  // in-place add/delete is not tracked). Keep at least one category active.
  toggle(category: string): void {
    const next = new Set(this.active)
    if (next.has(category)) {
      if (next.size > 1) next.delete(category)
    } else {
      next.add(category)
    }
    this.active = next
    this.sel = 0
  }
}

export const terminalSwitcherStore = new TerminalSwitcherStore()
export const commandHistoryStore = new CommandHistoryStore()
export const commandPaletteStore = new CommandPaletteStore()
