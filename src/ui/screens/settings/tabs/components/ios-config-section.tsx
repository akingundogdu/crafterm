import { requestSidebar } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptForm } from '@ui/components/dialog/dialog'
import { reconcileWorktrees } from '@services/worktrees'
import { iosConfigRepo } from '@repositories'
import type { ProjectNode } from '@ui/types/types'
import { labeledInput } from '../../shared'
import type { IosConfigKey } from '../projects.types'
import { defaultIosConfig } from '../projects.state'

export function buildIosConfigSection(p: ProjectNode, panel: HTMLElement): void {
  panel.replaceChildren()

  // "iOS app" toggle: reveals the config + the sidebar worktree manager.
  const checkbox = (<input type="text" />) as HTMLInputElement
  checkbox.type = 'checkbox'
  checkbox.checked = !!p.iosApp
  checkbox.style.marginRight = '8px'
  const toggleLabel = (
    <label style={{ cursor: 'pointer' }}>
      {checkbox}
      <span>iOS app (show the worktree manager under this project)</span>
    </label>
  ) as HTMLLabelElement
  const toggleField = (<div class="field">{toggleLabel}</div>) as HTMLDivElement
  panel.appendChild(toggleField)

  const body = (<div />) as HTMLDivElement
  panel.appendChild(body)

  const renderBody = (): void => {
    body.replaceChildren()
    if (!p.iosApp) {
      body.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">Enable to manage this app’s git worktrees (build / run / status) from the sidebar.</div>'
      )
      return
    }
    if (!p.iosConfig) p.iosConfig = defaultIosConfig()
    const cfg = p.iosConfig

    // Repo root = the project's working directory. Editing it here also updates
    // the project path (so worktrees, build/run, and cmd+T all use this repo).
    const repoInput = labeledInput(body, 'iOS repo path', 'text', p.path, (v) => {
      p.path = v.trim()
      persistence.save()
      requestSidebar()
    })
    repoInput.placeholder = '/Users/you/path/to/your-ios-repo'
    repoInput.style.maxWidth = '420px'
    if (!p.path) {
      body.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint" style="color:var(--amber,#e0a44a)">Required: set this to the iOS app’s git repository.</div>'
      )
    }

    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">The fields below auto-detect from the Xcode project when left empty.</div>'
    )
    const field = (label: string, key: IosConfigKey, placeholder: string): void => {
      const input = labeledInput(body, label, 'text', cfg[key], (v) => {
        cfg[key] = v.trim()
        iosConfigRepo.set(p.id, cfg)
      })
      input.placeholder = placeholder
      input.style.maxWidth = '420px'
    }
    field('Xcode project / workspace', 'project', 'auto: discovered (.xcworkspace/.xcodeproj)')
    field('Scheme', 'scheme', 'auto: xcodebuild -list')
    field('Base bundle identifier', 'baseBundleId', 'auto: from build settings, e.g. com.acme.app')
    field('Display name prefix', 'displayPrefix', 'auto: scheme name')
    field('Default simulator', 'defaultSimulator', 'auto: booted, else first iPhone')
    field('Worktrees directory', 'worktreesDir', 'auto: <repo parent>/worktrees')

    // Files-to-copy list: gitignored local files seeded into a fresh worktree.
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field" style="margin-top:14px"><label>Copy into new worktrees</label></div>'
    )
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">Gitignored local files (paths relative to the repo root) copied from the main checkout, e.g. Secrets.xcconfig.</div>'
    )
    const addBtn = (<button class="settings-inline-btn">+ Add file</button>) as HTMLButtonElement
    body.appendChild(addBtn)
    const list = (<div class="palette-admin-list" />) as HTMLDivElement
    body.appendChild(list)

    const renderFiles = (): void => {
      list.replaceChildren()
      if (!cfg.copyFiles.length) {
        list.insertAdjacentHTML('beforeend', '<div class="field-hint">No files yet.</div>')
        return
      }
      cfg.copyFiles.forEach((rel, i) => {
        const del = (<button class="worktree-action worktree-remove">Delete</button>) as HTMLButtonElement
        del.addEventListener('click', () => {
          cfg.copyFiles.splice(i, 1)
          iosConfigRepo.set(p.id, cfg)
          renderFiles()
        })
        const row = (
          <div class="palette-admin-row">
            <span class="palette-admin-cmd">{rel}</span>
            {del}
          </div>
        ) as HTMLDivElement
        list.appendChild(row)
      })
    }
    addBtn.addEventListener('click', () => {
      void promptForm({
        title: 'Add file to copy',
        fields: [{ key: 'path', label: 'Path (relative to repo root)', placeholder: 'Secrets.xcconfig' }],
        confirmText: UITexts.Settings.projects.add
      }).then((values) => {
        const rel = (values?.path || '').trim()
        if (!rel || cfg.copyFiles.includes(rel)) return
        cfg.copyFiles.push(rel)
        iosConfigRepo.set(p.id, cfg)
        renderFiles()
      })
    })
    renderFiles()
  }

  checkbox.addEventListener('change', () => {
    p.iosApp = checkbox.checked
    if (p.iosApp) {
      iosConfigRepo.ensure(p.id, defaultIosConfig)
      p.supportWorktree = true // iOS needs the worktree nodes to attach to
      void reconcileWorktrees()
    }
    persistence.save()
    requestSidebar()
    renderBody()
  })
  renderBody()
}
