import type { ProjectNode, Application } from '@ui/types/types'
import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { runApplications, createFeature, resolveAppPath } from '@ui/commands/commands'
import { overlayModal } from '../shared'
import {
  sanitizeBranch,
  disableSpellcheck,
  buildProjectEntries,
  filterEntries,
  stepSelection,
  makeChoose,
  makeRunSplit,
  makeRunTab
} from './project.state'
import { projectRow } from './components/project-row'
import { environmentChips } from './components/environment-chips'
import { applicationCheckboxRow } from './components/application-checkbox-row'
import { runCommandRow } from './components/run-command-row'
import { runAppRow } from './components/run-app-row'

// Owns the project picker overlay: builds the modal, drives the filtered project
// list and keyboard navigation. Methods close over this instance's entries +
// selection, which is why they live here rather than in the stateless state.
export class ProjectPickerController {
  private readonly parentFolderId: string | null
  private readonly splitMode: boolean

  private input!: HTMLInputElement
  private list!: HTMLDivElement
  private close!: () => void
  private entries!: ReturnType<typeof buildProjectEntries>
  private choose!: ReturnType<typeof makeChoose>
  private sel = 0

  constructor(parentFolderId: string | null, opts?: { split?: boolean }) {
    this.parentFolderId = parentFolderId
    this.splitMode = !!opts?.split
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = (
      <h2>{this.splitMode ? UITexts.Pickers.project.split : UITexts.Pickers.project.open}</h2>
    ) as HTMLHeadingElement
    this.input = (
      <input
        class="search-box-input"
        type="text"
        placeholder={
          this.splitMode
            ? UITexts.Pickers.project.splitPlaceholder
            : UITexts.Pickers.project.openPlaceholder
        }
        ref={disableSpellcheck}
      />
    ) as HTMLInputElement
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.input, this.list)

    this.entries = buildProjectEntries(this.parentFolderId, (p) => new RunAppsController(p).open())
    this.choose = makeChoose(close, this.splitMode)

    this.wireEvents()
    this.render()
    this.input.focus()
  }

  private filtered = (): ReturnType<typeof buildProjectEntries> =>
    filterEntries(this.entries, this.input.value)

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    items.forEach((e, i) => {
      this.list.appendChild(
        projectRow({
          label: e.label,
          sub: e.sub,
          active: i === this.sel,
          onClick: (split) => this.choose(e, split),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private wireEvents = (): void => {
    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = stepSelection(e.key, this.sel, items.length)
        this.highlight()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.choose(items[this.sel], e.metaKey || e.ctrlKey)
      }
    })
  }
}

// Modal for one project: choose an environment, tick apps, run them together.
export class RunAppsController {
  private readonly project: ProjectNode
  private readonly apps: Application[]

  private list!: HTMLDivElement
  private env: string
  private readonly checks = new Map<Application, HTMLInputElement>()

  constructor(project: ProjectNode) {
    this.project = project
    this.apps = project.apps ?? []
    this.env = settings.environments[0]
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    const h = (<h2>{`Run — ${this.project.name}`}</h2>) as HTMLHeadingElement
    modal.append(h)

    if (!this.apps.length || !settings.environments.length) {
      modal.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${
          this.apps.length ? UITexts.Pickers.project.noEnvironments : UITexts.Pickers.project.noApplications
        } Add them in Settings → Projects.</div>`
      )
      return
    }

    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
    modal.append(
      environmentChips({
        environments: settings.environments,
        selected: this.env,
        onSelect: (name) => {
          this.env = name
          this.renderApps()
        }
      })
    )

    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Applications</div>')
    this.list = (<div class="run-app-list" />) as HTMLDivElement
    modal.append(this.list)
    this.renderApps()

    const cancel = (<button onClick={close}>{UITexts.Pickers.project.cancel}</button>) as HTMLButtonElement
    const run = (
      <button
        class="button-primary"
        onClick={() => {
          const selected = this.apps.filter((a) => this.checks.get(a)?.checked)
          if (selected.length) void runApplications(this.project, this.env, selected)
          close()
        }}
      >
        Run
      </button>
    ) as HTMLButtonElement
    const actions = (
      <div class="modal-actions">
        {cancel}
        {run}
      </div>
    ) as HTMLDivElement
    modal.append(actions)
  }

  private renderApps = (): void => {
    this.list.replaceChildren()
    this.checks.clear()
    this.apps.forEach((app) => {
      const cmd = (app.commands?.[this.env] ?? '').trim()
      const { row, checkbox } = applicationCheckboxRow({ name: app.name, cmd, env: this.env })
      this.checks.set(app, checkbox)
      this.list.appendChild(row)
    })
  }
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export class RunCommandController {
  private readonly project: ProjectNode

  constructor(project: ProjectNode) {
    this.project = project
  }

  open(): void {
    const cmds = this.project.runCommands ?? []
    const { modal, close } = overlayModal('picker-modal')
    const h = (<h2>{`Run command — ${this.project.name}`}</h2>) as HTMLHeadingElement
    modal.append(h)
    if (!cmds.length) {
      modal.insertAdjacentHTML(
        'beforeend',
        '<div class="empty-hint">No run commands. Add them in Settings → Projects.</div>'
      )
      return
    }
    const list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(list)
    for (const rc of cmds) {
      const target = {
        name: rc.name,
        path: this.project.path,
        command: rc.command,
        env: this.project.env,
        shell: this.project.shell
      }
      list.appendChild(
        runCommandRow({
          name: rc.name,
          command: rc.command,
          onSplit: makeRunSplit(target, close),
          onTab: makeRunTab(target, this.project.id, close)
        })
      )
    }
  }
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export class RunAppController {
  private readonly project: ProjectNode
  private readonly app: Application

  constructor(project: ProjectNode, app: Application) {
    this.project = project
    this.app = app
  }

  open(): void {
    const envs = settings.environments.filter((e) => (this.app.commands?.[e] ?? '').trim())
    const { modal, close } = overlayModal('picker-modal')
    const h = (<h2>{`Run ${this.app.name} — ${this.project.name}`}</h2>) as HTMLHeadingElement
    modal.append(h)
    if (!envs.length) {
      modal.insertAdjacentHTML(
        'beforeend',
        '<div class="empty-hint">No commands configured for this application. Add them in Settings → Projects.</div>'
      )
      return
    }
    const appPath = resolveAppPath(this.project.path, this.app.path)
    const startup = this.project.startup?.trim()
    const list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(list)
    for (const env of envs) {
      const dev = (this.app.commands[env] ?? '').trim()
      const command = startup ? `${startup} && ${dev}` : dev
      const target = {
        name: `${this.app.name} · ${env}`,
        path: appPath,
        command,
        env: this.project.env,
        shell: this.project.shell
      }
      list.appendChild(
        runAppRow({
          env,
          command: dev,
          onSplit: makeRunSplit(target, close),
          onTab: makeRunTab(target, this.project.id, close)
        })
      )
    }
  }
}

// Feature setup: feature name + branch + env + apps (+ per-app worktree).
export class FeatureSetupController {
  private readonly project: ProjectNode
  private readonly apps: Application[]
  private readonly hasApps: boolean

  private list!: HTMLDivElement
  private env: string
  private readonly incl = new Map<Application, HTMLInputElement>()
  private readonly wt = new Map<Application, HTMLInputElement>()

  constructor(project: ProjectNode) {
    this.project = project
    this.apps = project.apps ?? []
    this.hasApps = this.apps.length > 0 && settings.environments.length > 0
    this.env = settings.environments[0] ?? ''
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    const h = (<h2>{`New feature — ${this.project.name}`}</h2>) as HTMLHeadingElement
    modal.append(h)
    if (!this.hasApps) {
      modal.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${
          this.apps.length
            ? UITexts.Pickers.project.noEnvironmentsConfigured
            : UITexts.Pickers.project.noApplicationsDefined
        } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.</div>`
      )
    }

    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature name</div>')
    const nameInput = (<input class="reminder-input" placeholder="maxi onboarding" />) as HTMLInputElement
    modal.append(nameInput)

    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Branch</div>')
    const branchInput = (<input class="reminder-input" placeholder="maxi-onboarding" />) as HTMLInputElement
    modal.append(branchInput)
    let branchEdited = false
    branchInput.addEventListener('input', () => {
      branchEdited = true
    })
    nameInput.addEventListener('input', () => {
      if (!branchEdited) branchInput.value = sanitizeBranch(nameInput.value)
    })

    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Base branch</div>')
    const baseInput = (
      <input
        class="reminder-input"
        ref={(el: HTMLInputElement) => {
          el.value = 'main'
        }}
      />
    ) as HTMLInputElement
    modal.append(baseInput)

    if (this.hasApps) {
      modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
      modal.append(
        environmentChips({
          environments: settings.environments,
          selected: this.env,
          onSelect: (name) => {
            this.env = name
            this.renderApps()
          }
        })
      )

      modal.insertAdjacentHTML(
        'beforeend',
        '<div class="reminder-label">Applications (✓ include · ⑂ worktree)</div>'
      )
      this.list = (<div class="run-app-list" />) as HTMLDivElement
      modal.append(this.list)
      this.renderApps()
    }

    const cancel = (<button onClick={close}>{UITexts.Pickers.project.cancel}</button>) as HTMLButtonElement
    const create = (
      <button
        class="button-primary"
        onClick={() => {
          const branch = sanitizeBranch(branchInput.value || nameInput.value)
          if (!branch) return
          const chosen = this.apps
            .filter((a) => this.incl.get(a)?.checked)
            .map((app) => ({ app, worktree: !!this.wt.get(app)?.checked }))
          if (!chosen.length) return
          void createFeature(this.project, { branch, base: baseInput.value, env: this.env, apps: chosen })
          close()
        }}
      >
        Create
      </button>
    ) as HTMLButtonElement
    const actions = (
      <div class="modal-actions">
        {cancel}
        {create}
      </div>
    ) as HTMLDivElement
    modal.append(actions)
    nameInput.focus()
  }

  private renderApps = (): void => {
    this.list.replaceChildren()
    this.incl.clear()
    this.wt.clear()
    this.apps.forEach((app) => {
      const cmd = (app.commands?.[this.env] ?? '').trim()
      const { row, checkbox, worktreeCheckbox } = applicationCheckboxRow({
        name: app.name,
        cmd,
        env: this.env,
        withWorktree: true
      })
      this.incl.set(app, checkbox)
      if (worktreeCheckbox) this.wt.set(app, worktreeCheckbox)
      this.list.appendChild(row)
    })
  }
}
