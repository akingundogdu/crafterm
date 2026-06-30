import { el } from '@views/lib/dom'
import { requestSidebar } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptForm } from '../../lib/prompt-form'
import { reconcileWorktrees } from '@services/worktrees'
import { iosConfigRepo } from '@repositories'
import type { ProjectNode } from '@views/types/types'
import { labeledInput } from '../../shared'
import type { IosConfigKey } from '../projects.types'
import { defaultIosConfig } from '../projects.state'

export class IosConfigSectionController {
  private readonly p: ProjectNode
  private readonly panel: HTMLElement
  private body!: HTMLDivElement

  constructor(p: ProjectNode, panel: HTMLElement) {
    this.p = p
    this.panel = panel
  }

  build(): void {
    const { p, panel } = this
    panel.replaceChildren()

    // "iOS app" toggle: reveals the config + the sidebar worktree manager.
    const checkbox = el('input', {
      type: 'checkbox',
      onChange: () => {
        p.iosApp = checkbox.checked
        if (p.iosApp) {
          iosConfigRepo.ensure(p.id, defaultIosConfig)
          p.supportWorktree = true // iOS needs the worktree nodes to attach to
          void reconcileWorktrees()
        }
        persistence.save()
        requestSidebar()
        this.renderBody()
      }
    })
    checkbox.checked = !!p.iosApp
    checkbox.style.marginRight = '8px'
    const toggleLabel = el('label', null, checkbox, el('span', null, 'iOS app (show the worktree manager under this project)'))
    toggleLabel.style.cursor = 'pointer'
    panel.appendChild(el('div', { class: 'field' }, toggleLabel))

    this.body = el('div')
    panel.appendChild(this.body)

    this.renderBody()
  }

  private renderBody = (): void => {
    const { p, body } = this
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
    const addBtn = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: () => {
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
        }
      },
      '+ Add file'
    )
    body.appendChild(addBtn)
    const list = el('div', { class: 'palette-admin-list' })
    body.appendChild(list)

    const renderFiles = (): void => {
      list.replaceChildren()
      if (!cfg.copyFiles.length) {
        list.insertAdjacentHTML('beforeend', '<div class="field-hint">No files yet.</div>')
        return
      }
      cfg.copyFiles.forEach((rel, i) => {
        const del = el(
          'button',
          {
            class: 'worktree-action worktree-remove',
            onClick: () => {
              cfg.copyFiles.splice(i, 1)
              iosConfigRepo.set(p.id, cfg)
              renderFiles()
            }
          },
          'Delete'
        )
        list.appendChild(el('div', { class: 'palette-admin-row' }, el('span', { class: 'palette-admin-cmd' }, rel), del))
      })
    }
    renderFiles()
  }
}
