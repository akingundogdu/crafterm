import { settings } from '@ui/state/state'
import { applicationRepo } from '@repositories'
import { FormField } from '@ui/components'
import type { ProjectNode, Application } from '@ui/types/types'

type FieldFn = (
  parent: HTMLElement,
  label: string,
  value: string,
  placeholder: string,
  onChange: (v: string) => void,
  opts?: { textarea?: boolean; rows?: number; options?: string[] }
) => void

interface AppsSectionProps {
  project: ProjectNode
  parent: HTMLElement
  field: FieldFn
  uid: (prefix: string) => string
  renderTree: () => void
  renderDetail: () => void
}

// The Applications section of the selected project's editor.
export function buildAppsSection(props: AppsSectionProps): void {
  const { project: p, parent, field, uid, renderTree, renderDetail } = props
  parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Applications</div>')
  if (!applicationRepo.listForProject(p.id).length) {
    parent.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">No applications. Add one to run it (with per-environment commands).</div>'
    )
  }
  applicationRepo.listForProject(p.id).forEach((app) => {
    const title = (<span class="app-card-title">{app.name || '(unnamed app)'}</span>) as HTMLSpanElement
    const delApp = (
      <button class="settings-app-delete" title="Remove application">
        ✕
      </button>
    ) as HTMLButtonElement
    delApp.addEventListener('click', () => {
      applicationRepo.remove(p.id, app.id)
      renderTree()
      renderDetail()
    })
    const card = (
      <div class="settings-app-card">
        <div class="app-card-head">
          {title}
          {delApp}
        </div>
      </div>
    ) as HTMLDivElement

    field(card, 'Name', app.name, 'backend', (v) => {
      app.name = v.trim()
      title.textContent = app.name || '(unnamed app)'
      renderTree()
      applicationRepo.upsert(p.id, app)
    })
    field(card, 'Path', app.path ?? '', 'relative to project, or absolute (optional)', (v) => {
      app.path = v.trim() || undefined
      applicationRepo.upsert(p.id, app)
    })

    const opensSel = (
      <select class="settings-select">
        {(
          [
            ['split', 'Split (tiled tab)'],
            ['tab', 'Separate tab']
          ] as const
        ).map(([v, lbl]) => (
          <option value={v} selected={(app.opensAs ?? 'split') === v}>
            {lbl}
          </option>
        ))}
      </select>
    ) as HTMLSelectElement
    opensSel.addEventListener('change', () => {
      app.opensAs = opensSel.value as Application['opensAs']
      applicationRepo.upsert(p.id, app)
    })
    const opensWrap = (<FormField label="Opens as">{opensSel}</FormField>) as HTMLDivElement
    card.appendChild(opensWrap)

    // one command field per environment
    card.insertAdjacentHTML('beforeend', '<div class="app-cmd-head">Commands per environment</div>')
    app.commands = app.commands ?? {}
    for (const envName of settings.environments) {
      field(card, envName, app.commands[envName] ?? '', `command for ${envName}`, (v) => {
        const t = v.trim()
        if (t) app.commands[envName] = t
        else delete app.commands[envName]
        applicationRepo.upsert(p.id, app)
      })
    }

    // Optional named menu commands surfaced in the pane action menu of any
    // terminal spawned from this application.
    card.insertAdjacentHTML('beforeend', '<div class="app-cmd-head">Run commands</div>')
    app.runCommands = app.runCommands ?? []
    app.runCommands.forEach((rc) => {
      const nameI = (<input type="text" placeholder="name" />) as HTMLInputElement
      nameI.value = rc.name
      nameI.addEventListener('change', () => {
        rc.name = nameI.value.trim() || rc.name
        applicationRepo.upsert(p.id, app)
      })
      nameI.addEventListener('keydown', (e) => e.stopPropagation())
      const cmdI = (<input type="text" placeholder="shell command" />) as HTMLInputElement
      cmdI.value = rc.command
      cmdI.addEventListener('change', () => {
        rc.command = cmdI.value.trim()
        applicationRepo.upsert(p.id, app)
      })
      cmdI.addEventListener('keydown', (e) => e.stopPropagation())
      const delRc = (
        <button class="settings-app-delete" title="Remove command">
          ✕
        </button>
      ) as HTMLButtonElement
      delRc.addEventListener('click', () => {
        app.runCommands = (app.runCommands ?? []).filter((x) => x !== rc)
        applicationRepo.upsert(p.id, app)
        renderDetail()
      })
      const row = (
        <div class="settings-app-rc-row">
          {nameI}
          {cmdI}
          {delRc}
        </div>
      ) as HTMLDivElement
      card.appendChild(row)
    })
    const addRc = (
      <button class="settings-inline-btn app-rc-add">+ Add run command</button>
    ) as HTMLButtonElement
    addRc.addEventListener('click', () => {
      app.runCommands = app.runCommands ?? []
      app.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
      applicationRepo.upsert(p.id, app)
      renderDetail()
    })
    card.appendChild(addRc)

    parent.appendChild(card)
  })

  const addApp = (<button class="settings-inline-btn">+ Add application</button>) as HTMLButtonElement
  addApp.addEventListener('click', () => {
    applicationRepo.upsert(p.id, { id: uid('app'), name: 'app', commands: {} })
    renderTree()
    renderDetail()
  })
  parent.appendChild(addApp)
}
