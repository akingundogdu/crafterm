import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { PaletteCommand } from '@views/types/types'
import store from '../commands.store'
import { paletteCategories, editPaletteCommand, removePaletteCommand } from '../commands.store'
import PaletteCommandRow from './palette-command-row'

interface PaletteItem {
  key: string
  cat?: string
  row?: { cmd: PaletteCommand; onEdit: () => void; onDelete: () => void }
}

// Reactive palette-admin body: heading, hint, "+ Add command", and the category-grouped
// command rows. Reads store.paletteCommands so gea re-renders it after an add / edit /
// delete. Rendered as a JSX child of PaletteCommandsControl (the imperatively mounted
// shell does not re-subscribe on store writes — the ssh.tsx board pattern). The per-row
// handlers are built in the grouping loop where each command is definitely present, then
// passed as props to the row Component (never as `onX` on a nested mapped element).
// Self-contained — no @ui.
class PaletteCommandsList extends Component {
  private add = (): void => {
    void editPaletteCommand().then(() => store.reloadPalette())
  }

  // Flatten category headers + command rows into one keyed list so a single unconditional
  // `.map()` renders both (category `<div>` carries no handler; rows are child Components).
  private items(cmds: PaletteCommand[]): PaletteItem[] {
    const out: PaletteItem[] = []
    for (const cat of paletteCategories(cmds)) {
      out.push({ key: `cat:${cat}`, cat })
      for (const c of cmds.filter((x) => x.category === cat)) {
        out.push({
          key: `cmd:${c.id}`,
          row: {
            cmd: c,
            onEdit: () => void editPaletteCommand(c).then(() => store.reloadPalette()),
            onDelete: () => {
              removePaletteCommand(c.id)
              store.reloadPalette()
            }
          }
        })
      }
    }
    return out
  }

  template() {
    const cmds = store.paletteCommands
    const items = this.items(cmds)
    return (
      <div>
        <h3 style="margin-top:20px">{UITexts.Settings.commands.commandPalette}</h3>
        <div class="field-hint">
          Entries shown in Cmd+Shift+P under category chips. Selecting one types it into the active terminal (without
          running it).
        </div>
        <button class="settings-inline-btn" onClick={this.add}>
          {UITexts.Settings.commands.addCommand}
        </button>
        <div class="palette-admin-list">
          {items.map((it) =>
            it.row ? (
              <PaletteCommandRow key={it.key} command={it.row.cmd} onEdit={it.row.onEdit} onDelete={it.row.onDelete} />
            ) : (
              <div key={it.key} class="palette-admin-cat">
                {it.cat}
              </div>
            )
          )}
          {cmds.length === 0 && <div class="field-hint">{UITexts.Settings.commands.noCommands}</div>}
        </div>
      </div>
    )
  }
}

// Thin shell mounted imperatively into the sub-tab panel; renders the reactive
// PaletteCommandsList JSX child so gea tracks its store reads. Self-contained — no @ui.
export default class PaletteCommandsControl extends Component {
  template() {
    return <PaletteCommandsList />
  }
}
