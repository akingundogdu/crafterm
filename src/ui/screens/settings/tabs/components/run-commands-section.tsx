import { persistence } from '@repositories/persistence.service'
import type { ProjectNode } from '@ui/types/types'

type FieldFn = (
  parent: HTMLElement,
  label: string,
  value: string,
  placeholder: string,
  onChange: (v: string) => void,
  opts?: { textarea?: boolean; rows?: number; options?: string[] }
) => void

interface RunCommandsSectionProps {
  project: ProjectNode
  parent: HTMLElement
  field: FieldFn
  uid: (prefix: string) => string
  renderDetail: () => void
}

// Run commands: named one-shot shell commands. Surfaced in the sidebar
// "Run command…" modal and executed at the project path (split or new tab).
export function buildRunCommandsSection(props: RunCommandsSectionProps): void {
  const { project: p, parent, field, uid, renderDetail } = props
  parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Run commands</div>')
  p.runCommands = p.runCommands ?? []
  if (!p.runCommands.length) {
    parent.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">No run commands. Add named shell commands (e.g. "Deploy", "Lint") that you can fire from the sidebar.</div>'
    )
  }
  p.runCommands.forEach((rc) => {
    const title = (<span class="app-card-title">{rc.name || '(unnamed command)'}</span>) as HTMLSpanElement
    const del = (
      <button
        class="settings-app-delete"
        title="Remove command"
        onClick={() => {
          p.runCommands = (p.runCommands ?? []).filter((x) => x !== rc)
          persistence.save()
          renderDetail()
        }}
      >
        ✕
      </button>
    ) as HTMLButtonElement
    const card = (
      <div class="settings-app-card">
        <div class="app-card-head">
          {title}
          {del}
        </div>
      </div>
    ) as HTMLDivElement
    field(card, 'Name', rc.name, 'Deploy', (v) => {
      rc.name = v.trim() || rc.name
      title.textContent = rc.name || '(unnamed command)'
      persistence.save()
    })
    field(card, 'Command', rc.command, 'npm run deploy', (v) => {
      rc.command = v.trim()
      persistence.save()
    })
    parent.appendChild(card)
  })
  const add = (
    <button
      class="settings-inline-btn"
      onClick={() => {
        p.runCommands = p.runCommands ?? []
        p.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
        persistence.save()
        renderDetail()
      }}
    >
      + Add command
    </button>
  ) as HTMLButtonElement
  parent.appendChild(add)
}
