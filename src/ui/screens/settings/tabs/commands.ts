import { settings, uid } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { promptForm } from '../../../dialog'
import { paletteCommandRepo } from '@services/storage/repositories'
import type { PaletteCommand } from '../../../types'
import { pickFolderPath } from '../../pickers/folder/folder'
import { buildSubTabs, labeledInput } from '../shared'

export function buildCommandsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Commands</h3>')
  buildSubTabs(panel, [
    {
      label: 'General',
      build: (el) => {
        const ide = labeledInput(el, 'Open code file (ide)', 'text', settings.commands.ide, (v) => {
          settings.commands.ide = v.trim() || 'ide'
          persistence.save()
        })
        ide.style.maxWidth = '280px'
        const zsh = labeledInput(el, 'Update zsh config', 'text', settings.commands.openMyZsh, (v) => {
          settings.commands.openMyZsh = v.trim() || 'openmyzsh'
          persistence.save()
        })
        zsh.style.maxWidth = '280px'
        el.insertAdjacentHTML(
          'beforeend',
          '<div class="field-hint">Shell commands run in a new terminal.</div>'
        )
      }
    },
    { label: 'Markdown folders', build: (el) => buildMarkdownFoldersControl(el) },
    { label: 'Command palette', build: (el) => buildPaletteCommandsControl(el) }
  ])
}

// Manage the Cmd+Shift+P palette entries (predefined + git/linux cheatsheets).
function buildPaletteCommandsControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3 style="margin-top:20px">Command palette</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Entries shown in Cmd+Shift+P under category chips. Selecting one types it into the active terminal (without running it).</div>'
  )

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ Add command'
  panel.appendChild(addBtn)

  const list = document.createElement('div')
  list.className = 'palette-admin-list'
  panel.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    const cmds = paletteCommandRepo.getAll()
    if (!cmds.length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No commands yet.</div>')
      return
    }
    const cats: string[] = []
    for (const c of cmds) if (!cats.includes(c.category)) cats.push(c.category)
    cats.sort((a, b) => a.localeCompare(b))
    cats.forEach((cat) => {
      const head = document.createElement('div')
      head.className = 'palette-admin-cat'
      head.textContent = cat
      list.appendChild(head)
      cmds
        .filter((c) => c.category === cat)
        .forEach((c) => {
          const row = document.createElement('div')
          row.className = 'palette-admin-row'
          const txt = document.createElement('div')
          txt.className = 'palette-admin-text'
          const nm = document.createElement('span')
          nm.className = 'palette-admin-name'
          nm.textContent = c.name
          const cmd = document.createElement('span')
          cmd.className = 'palette-admin-cmd'
          cmd.textContent = c.command
          txt.append(nm, cmd)
          const edit = document.createElement('button')
          edit.className = 'wt-act'
          edit.textContent = 'Edit'
          edit.addEventListener('click', () => void editPaletteCommand(c).then(render))
          const del = document.createElement('button')
          del.className = 'wt-act wt-remove'
          del.textContent = 'Delete'
          del.addEventListener('click', () => {
            paletteCommandRepo.remove(c.id)
            render()
          })
          row.append(txt, edit, del)
          list.appendChild(row)
        })
    })
  }
  addBtn.addEventListener('click', () => void editPaletteCommand().then(render))
  render()
}

// Add or edit one palette command via the shared form modal.
async function editPaletteCommand(existing?: PaletteCommand): Promise<void> {
  const values = await promptForm({
    title: existing ? 'Edit command' : 'New command',
    fields: [
      { key: 'category', label: 'Category', value: existing?.category, placeholder: 'predefined, git, linux…' },
      { key: 'name', label: 'Name', value: existing?.name, placeholder: 'short label' },
      { key: 'command', label: 'Command', value: existing?.command, placeholder: 'git status' }
    ],
    confirmText: existing ? 'Save' : 'Add'
  })
  if (!values) return // cancelled, or category (required first field) left empty
  const command = (values.command || '').trim()
  if (!command) return
  const cmd: PaletteCommand = {
    id: existing?.id ?? uid('pc'),
    category: (values.category || '').trim().toLowerCase() || 'predefined',
    name: (values.name || '').trim() || command,
    command
  }
  paletteCommandRepo.upsert(cmd)
}

// Folders shown as filter chips in the Cmd+O markdown finder. Picked via the
// folder browser; only these folders are listed (and searched) there.
function buildMarkdownFoldersControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Markdown folders</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">These folders become the filter chips in the Cmd+O markdown finder.</div>'
  )

  const list = document.createElement('div')
  list.className = 'projects-editor'
  panel.appendChild(list)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ Add folder'
  panel.appendChild(addBtn)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')

  const render = (): void => {
    list.replaceChildren()
    if (!settings.commands.mdFolders.length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No folders yet.</div>')
    }
    settings.commands.mdFolders.forEach((path, idx) => {
      const row = document.createElement('div')
      row.className = 'project-edit-row'
      const label = document.createElement('span')
      label.className = 'mdfolder-path'
      label.textContent = pretty(path)
      label.title = path
      const del = document.createElement('button')
      del.className = 'project-del'
      del.textContent = '✕'
      del.title = 'Remove'
      del.addEventListener('click', () => {
        settings.commands.mdFolders.splice(idx, 1)
        persistence.save()
        render()
      })
      row.append(label, del)
      list.appendChild(row)
    })
  }

  addBtn.addEventListener('click', async () => {
    const picked = await pickFolderPath()
    if (!picked) return
    if (!settings.commands.mdFolders.includes(picked)) {
      settings.commands.mdFolders.push(picked)
      persistence.save()
      render()
    }
  })
  render()
}
