import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { pickFolderPath } from '../../pickers/folder/folder'
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

export function buildCommandsPanel(panel: HTMLElement): void {
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
    { label: UITexts.Settings.commands.markdownFolders, build: (el) => buildMarkdownFoldersControl(el) },
    { label: UITexts.Settings.commands.commandPalette, build: (el) => buildPaletteCommandsControl(el) }
  ])
}

// Manage the Cmd+Shift+P palette entries (predefined + git/linux cheatsheets).
function buildPaletteCommandsControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:20px">${UITexts.Settings.commands.commandPalette}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Entries shown in Cmd+Shift+P under category chips. Selecting one types it into the active terminal (without running it).</div>'
  )

  const addBtn = (
    <button class="settings-inline-btn">{UITexts.Settings.commands.addCommand}</button>
  ) as HTMLButtonElement
  panel.appendChild(addBtn)

  const list = (<div class="palette-admin-list" />) as HTMLDivElement
  panel.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    const cmds = allPaletteCommands()
    if (!cmds.length) {
      list.insertAdjacentHTML('beforeend', `<div class="field-hint">${UITexts.Settings.commands.noCommands}</div>`)
      return
    }
    paletteCategories(cmds).forEach((cat) => {
      const head = (<div class="palette-admin-cat">{cat}</div>) as HTMLDivElement
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
  addBtn.addEventListener('click', () => void editPaletteCommand().then(render))
  render()
}

// Folders shown as filter chips in the Cmd+O markdown finder. Picked via the
// folder browser; only these folders are listed (and searched) there.
function buildMarkdownFoldersControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.commands.markdownFolders}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">These folders become the filter chips in the Cmd+O markdown finder.</div>'
  )

  const list = (<div class="projects-editor" />) as HTMLDivElement
  panel.appendChild(list)

  const addBtn = (<button class="settings-inline-btn">{UITexts.Settings.commands.addFolder}</button>) as HTMLButtonElement
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

  addBtn.addEventListener('click', async () => {
    const picked = await pickFolderPath()
    if (picked && addMdFolder(picked)) render()
  })
  render()
}
