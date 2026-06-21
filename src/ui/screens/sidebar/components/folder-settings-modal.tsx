import type { FolderNode, ProjectNode } from '@ui/types/types'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { createOverlay, FormField } from '@ui/components'

// Per-folder settings modal (startup command / env / shell). `renderSidebar` is
// injected so this piece does not import the shell back (avoids a cycle).
export function showFolderSettings(node: FolderNode | ProjectNode, renderSidebar: () => void): void {
  const isProject = node.kind === 'project'
  const { overlay, mount, close } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal modal-prompt'
  overlay.appendChild(modal)

  modal.appendChild(
    (<h2>{(isProject ? 'Project settings — ' : 'Folder settings — ') + node.name}</h2>) as HTMLHeadingElement
  )

  const textField = (label: string, value: string, ph: string): HTMLInputElement => {
    const i = (<input type="text" placeholder={ph} />) as HTMLInputElement
    i.value = value
    modal.appendChild((<FormField label={label}>{i}</FormField>) as HTMLDivElement)
    return i
  }
  // Projects expose name/path/command (the bits unique to a project); folders
  // don't have those — just the per-terminal defaults below.
  const nameInput = isProject ? textField('Name', node.name, 'Movve') : null
  const pathInput = isProject ? textField('Path', node.path, '~/code/movve') : null
  const commandInput = isProject ? textField('Command', node.command ?? '', 'claude (run on open, optional)') : null
  const startup = textField('Startup command', node.startup ?? '', 'e.g. claude')
  const shell = textField('Shell', node.shell ?? '', '(default)')

  const env = (<textarea class="folder-env" placeholder={'FOO=bar\nNODE_ENV=development'} />) as HTMLTextAreaElement
  env.value = node.env ?? ''
  env.rows = 4
  modal.appendChild(
    (
      <FormField label="Environment (KEY=VALUE per line)" extraClass="field-col">
        {env}
      </FormField>
    ) as HTMLDivElement
  )

  const cancel = (<button onClick={close}>{UITexts.Sidebar.cancel}</button>) as HTMLButtonElement
  const save = (
    <button
      class="button-primary"
      onClick={() => {
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
      }}
    >
      {UITexts.Sidebar.save}
    </button>
  ) as HTMLButtonElement
  modal.appendChild(
    (
      <div class="modal-actions">
        {cancel}
        {save}
      </div>
    ) as HTMLDivElement
  )
  modal.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()))

  mount()
  ;(nameInput ?? startup).focus()
}
