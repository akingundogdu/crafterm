import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { applicationRepo } from '@repositories'
import type { ProjectNode, Application } from '@views/types/types'

export type FieldFn = (
  parent: HTMLElement,
  label: string,
  value: string,
  placeholder: string,
  onChange: (v: string) => void,
  opts?: { textarea?: boolean; rows?: number; options?: string[] }
) => void

export interface AppsSectionProps {
  project: ProjectNode
  parent: HTMLElement
  field: FieldFn
  uid: (prefix: string) => string
  renderTree: () => void
  renderDetail: () => void
}

// The Applications section of the selected project's editor.
export class AppsSectionController {
  private readonly props: AppsSectionProps

  constructor(props: AppsSectionProps) {
    this.props = props
  }

  build(): void {
    const { project: p, parent, field, uid, renderTree, renderDetail } = this.props
    parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Applications</div>')
    if (!applicationRepo.listForProject(p.id).length) {
      parent.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">No applications. Add one to run it (with per-environment commands).</div>'
      )
    }
    applicationRepo.listForProject(p.id).forEach((app) => {
      const title = el('span', { class: 'app-card-title' }, app.name || '(unnamed app)')
      const delApp = el(
        'button',
        {
          class: 'settings-app-delete',
          title: 'Remove application',
          onClick: () => {
            applicationRepo.remove(p.id, app.id)
            renderTree()
            renderDetail()
          }
        },
        '✕'
      )
      const card = el('div', { class: 'settings-app-card' }, el('div', { class: 'app-card-head' }, title, delApp))

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

      const opensSel = el('select', {
        class: 'settings-select',
        onChange: () => {
          app.opensAs = opensSel.value as Application['opensAs']
          applicationRepo.upsert(p.id, app)
        }
      })
      ;([
        ['split', 'Split (tiled tab)'],
        ['tab', 'Separate tab']
      ] as const).forEach(([v, lbl]) => {
        const o = el('option', { value: v }, lbl)
        if ((app.opensAs ?? 'split') === v) o.selected = true
        opensSel.appendChild(o)
      })
      card.appendChild(el('div', { class: 'field' }, el('label', null, 'Opens as'), opensSel))

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
        const nameI = el('input', {
          type: 'text',
          placeholder: 'name',
          onChange: () => {
            rc.name = nameI.value.trim() || rc.name
            applicationRepo.upsert(p.id, app)
          },
          onKeydown: (e: KeyboardEvent) => e.stopPropagation()
        })
        nameI.value = rc.name
        const cmdI = el('input', {
          type: 'text',
          placeholder: 'shell command',
          onChange: () => {
            rc.command = cmdI.value.trim()
            applicationRepo.upsert(p.id, app)
          },
          onKeydown: (e: KeyboardEvent) => e.stopPropagation()
        })
        cmdI.value = rc.command
        const delRc = el(
          'button',
          {
            class: 'settings-app-delete',
            title: 'Remove command',
            onClick: () => {
              app.runCommands = (app.runCommands ?? []).filter((x) => x !== rc)
              applicationRepo.upsert(p.id, app)
              renderDetail()
            }
          },
          '✕'
        )
        card.appendChild(el('div', { class: 'settings-app-rc-row' }, nameI, cmdI, delRc))
      })
      const addRc = el(
        'button',
        {
          class: 'settings-inline-btn app-rc-add',
          onClick: () => {
            app.runCommands = app.runCommands ?? []
            app.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
            applicationRepo.upsert(p.id, app)
            renderDetail()
          }
        },
        '+ Add run command'
      )
      card.appendChild(addRc)

      parent.appendChild(card)
    })

    const addApp = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: () => {
          applicationRepo.upsert(p.id, { id: uid('app'), name: 'app', commands: {} })
          renderTree()
          renderDetail()
        }
      },
      '+ Add application'
    )
    parent.appendChild(addApp)
  }
}
