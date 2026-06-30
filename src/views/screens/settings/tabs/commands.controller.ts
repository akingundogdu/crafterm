import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { promptText } from '@views/components/dialog/prompt-text'
import { buildSubTabs, labeledInput } from '../shared'
import { buildPaletteCommandRow } from './components/palette-command-row'
import { buildMarkdownFolderRow } from './components/markdown-folder-row'
import {
  saveIdeCommand,
  saveOpenMyZsh,
  paletteCategories,
  allPaletteCommands,
  removePaletteCommand,
  editPaletteCommand,
  prettyMdPath,
  removeMdFolder,
  addMdFolder
} from './commands.state'

export class CommandsPanelController {
  private readonly panel: HTMLElement

  constructor(panel: HTMLElement) {
    this.panel = panel
  }

  build(): void {
    const { panel } = this
    panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.commands.heading}</h3>`)
    buildSubTabs(panel, [
      {
        label: UITexts.Settings.commands.general,
        build: (el) => {
          const ide = labeledInput(el, UITexts.Settings.commands.openCodeFile, 'text', settings.commands.ide, saveIdeCommand)
          ide.style.maxWidth = '280px'
          const zsh = labeledInput(el, UITexts.Settings.commands.updateZshConfig, 'text', settings.commands.openMyZsh, saveOpenMyZsh)
          zsh.style.maxWidth = '280px'
          el.insertAdjacentHTML(
            'beforeend',
            '<div class="field-hint">Shell commands run in a new terminal.</div>'
          )
        }
      },
      { label: UITexts.Settings.commands.markdownFolders, build: (el) => this.buildMarkdownFoldersControl(el) },
      { label: UITexts.Settings.commands.commandPalette, build: (el) => this.buildPaletteCommandsControl(el) }
    ])
  }

  // Manage the Cmd+Shift+P palette entries (predefined + git/linux cheatsheets).
  private buildPaletteCommandsControl = (panel: HTMLElement): void => {
    panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:20px">${UITexts.Settings.commands.commandPalette}</h3>`)
    panel.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">Entries shown in Cmd+Shift+P under category chips. Selecting one types it into the active terminal (without running it).</div>'
    )

    const addBtn = el(
      'button',
      { class: 'settings-inline-btn', onClick: () => void editPaletteCommand().then(render) },
      UITexts.Settings.commands.addCommand
    )
    panel.appendChild(addBtn)

    const list = el('div', { class: 'palette-admin-list' })
    panel.appendChild(list)

    const render = (): void => {
      list.replaceChildren()
      const cmds = allPaletteCommands()
      if (!cmds.length) {
        list.insertAdjacentHTML('beforeend', `<div class="field-hint">${UITexts.Settings.commands.noCommands}</div>`)
        return
      }
      paletteCategories(cmds).forEach((cat) => {
        const head = el('div', { class: 'palette-admin-cat' }, cat)
        list.appendChild(head)
        cmds
          .filter((c) => c.category === cat)
          .forEach((c) => {
            list.appendChild(
              buildPaletteCommandRow({
                command: c,
                onEdit: () => void editPaletteCommand(c).then(render),
                onDelete: () => {
                  removePaletteCommand(c.id)
                  render()
                }
              })
            )
          })
      })
    }
    render()
  }

  // Folders shown as filter chips in the Cmd+O markdown finder. In legacy these
  // were picked via the in-app folder browser (the un-migrated pickers
  // subsystem); here the path is entered via the @views text prompt instead.
  private buildMarkdownFoldersControl = (panel: HTMLElement): void => {
    panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.commands.markdownFolders}</h3>`)
    panel.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">These folders become the filter chips in the Cmd+O markdown finder.</div>'
    )

    const list = el('div', { class: 'projects-editor' })
    panel.appendChild(list)

    const addBtn = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: async () => {
          const picked = await promptText({
            title: UITexts.Settings.commands.addFolder,
            label: UITexts.Settings.commands.markdownFolders,
            placeholder: '~/path/to/folder',
            confirmText: UITexts.Settings.commands.addFolder
          })
          const path = (picked ?? '').trim()
          if (path && addMdFolder(path)) render()
        }
      },
      UITexts.Settings.commands.addFolder
    )
    panel.appendChild(addBtn)

    const render = (): void => {
      list.replaceChildren()
      if (!settings.commands.mdFolders.length) {
        list.insertAdjacentHTML('beforeend', `<div class="field-hint">${UITexts.Settings.commands.noFolders}</div>`)
      }
      settings.commands.mdFolders.forEach((path, idx) => {
        list.appendChild(
          buildMarkdownFolderRow({
            path,
            prettyPath: prettyMdPath(path),
            onDelete: () => {
              removeMdFolder(idx)
              render()
            }
          })
        )
      })
    }

    render()
  }
}
