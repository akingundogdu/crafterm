import type { FolderNode, ProjectNode } from '@views/types/types'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'

// A `.field` row mirroring the legacy FormField markup (`div.field > label + control`).
function field(label: string, control: HTMLElement, extraClass?: string): HTMLDivElement {
  return el('div', { class: extraClass ? `field ${extraClass}` : 'field' }, el('label', null, label), control)
}

// Per-folder settings modal (startup command / env / shell). `renderSidebar` is
// injected so this piece does not import the shell back (avoids a cycle).
export function showFolderSettings(node: FolderNode | ProjectNode, renderSidebar: () => void): void {
  const isProject = node.kind === 'project'
  const { overlay, mount, close } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal modal-prompt'
  overlay.appendChild(modal)

  modal.appendChild(el('h2', null, (isProject ? 'Project settings — ' : 'Folder settings — ') + node.name))

  const textField = (label: string, value: string, ph: string): HTMLInputElement => {
    const i = el('input', { type: 'text', placeholder: ph })
    i.value = value
    modal.appendChild(field(label, i))
    return i
  }
  // Projects expose name/path/command (the bits unique to a project); folders
  // don't have those — just the per-terminal defaults below.
  const nameInput = isProject ? textField('Name', node.name, 'Movve') : null
  const pathInput = isProject ? textField('Path', node.path, '~/code/movve') : null
  const commandInput = isProject ? textField('Command', node.command ?? '', 'claude (run on open, optional)') : null
  const startup = textField('Startup command', node.startup ?? '', 'e.g. claude')
  const shell = textField('Shell', node.shell ?? '', '(default)')

  const env = el('textarea', { class: 'folder-env', placeholder: 'FOO=bar\nNODE_ENV=development' })
  env.value = node.env ?? ''
  env.rows = 4
  modal.appendChild(field('Environment (KEY=VALUE per line)', env, 'field-col'))

  const cancel = el('button', { onClick: close }, UITexts.Sidebar.cancel)
  const save = el(
    'button',
    {
      class: 'button-primary',
      onClick: () => {
        if (isProject && nameInput && pathInput && commandInput) {
          const projNode = node as ProjectNode
          const newName = nameInput.value.trim()
          if (newName) projNode.name = newName
          projNode.path = pathInput.value.trim()
          projNode.command = commandInput.value.trim() || undefined
        }
        node.startup = startup.value.trim() || undefined
        node.shell = shell.value.trim() || undefined
        node.env = env.value.trim() || undefined
        persistence.save()
        renderSidebar()
        close()
      }
    },
    UITexts.Sidebar.save
  )
  modal.appendChild(el('div', { class: 'modal-actions' }, cancel, save))
  modal.querySelectorAll('input, textarea').forEach((node) => node.addEventListener('keydown', (e) => e.stopPropagation()))

  mount()
  ;(nameInput ?? startup).focus()
}
