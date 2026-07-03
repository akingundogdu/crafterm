import { Component } from '@geajs/core'
import { state, requestSidebar } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { findProjectById } from '@views/catalog/catalog'
import { reconcileWorktrees } from '@services/worktrees'
import { iosConfigRepo } from '@repositories'
import { promptForm } from '../../lib/prompt-form'
import type { IosConfigKey } from '../projects.types'
import { defaultIosConfig } from '../projects.state'
import IosConfigDetail from './ios-config-detail'
import store from './ios-config-section.store'

// Reactive body of the per-project iOS section. The toggle checkbox is bound to the
// reactive `store.enabled` (toggled via onChange → store reload, never in place — §gea
// checkbox rule) so flipping it mounts / unmounts the IosConfigDetail child. Every
// mutation resolves the RAW project / config (§gea 5.3) and persists through the repos.
class IosBody extends Component {
  private toggle = (enabled: boolean): void => {
    const p = findProjectById(state.tree, store.projectId)
    if (!p) return
    p.iosApp = enabled
    if (enabled) {
      iosConfigRepo.ensure(store.projectId, defaultIosConfig)
      p.supportWorktree = true // iOS needs the worktree nodes to attach to
      void reconcileWorktrees()
    }
    persistence.save()
    requestSidebar()
    store.reload(store.projectId)
  }

  private pathChange = (v: string): void => {
    const p = findProjectById(state.tree, store.projectId)
    if (!p) return
    p.path = v.trim()
    persistence.save()
    requestSidebar()
  }

  private fieldChange = (key: IosConfigKey, v: string): void => {
    const cfg = iosConfigRepo.ensure(store.projectId, defaultIosConfig)
    if (!cfg) return
    cfg[key] = v.trim()
    iosConfigRepo.set(store.projectId, cfg)
  }

  private addFile = (): void => {
    void promptForm({
      title: 'Add file to copy',
      fields: [{ key: 'path', label: 'Path (relative to repo root)', placeholder: 'Secrets.xcconfig' }],
      confirmText: UITexts.Settings.projects.add
    }).then((values) => {
      const rel = (values?.path || '').trim()
      const cfg = iosConfigRepo.ensure(store.projectId, defaultIosConfig)
      if (!cfg || !rel || cfg.copyFiles.includes(rel)) return
      cfg.copyFiles = [...cfg.copyFiles, rel]
      iosConfigRepo.set(store.projectId, cfg)
      store.reload(store.projectId)
    })
  }

  private deleteFile = (index: number): void => {
    const cfg = iosConfigRepo.ensure(store.projectId, defaultIosConfig)
    if (!cfg) return
    cfg.copyFiles = cfg.copyFiles.filter((_, i) => i !== index)
    iosConfigRepo.set(store.projectId, cfg)
    store.reload(store.projectId)
  }

  template() {
    const enabled = store.enabled
    const p = findProjectById(state.tree, store.projectId)
    const path = p?.path ?? ''
    const cfg = p?.iosConfig ?? defaultIosConfig()
    return (
      <div style={{ display: 'contents' }}>
        <div class="field">
          <label style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ marginRight: '8px' }}
              checked={enabled}
              onChange={(e: Event) => this.toggle((e.target as HTMLInputElement).checked)}
            />
            <span>iOS app (show the worktree manager under this project)</span>
          </label>
        </div>
        {!enabled && (
          <div class="field-hint">
            Enable to manage this app’s git worktrees (build / run / status) from the sidebar.
          </div>
        )}
        {enabled && (
          <IosConfigDetail
            path={path}
            cfg={cfg}
            onPathChange={this.pathChange}
            onFieldChange={this.fieldChange}
            onAddFile={this.addFile}
            onDeleteFile={this.deleteFile}
          />
        )}
      </div>
    )
  }
}

// Thin shell for the iOS section, mounted imperatively into its sub-tab panel host.
// The reactive markup lives in the IosBody JSX child (display:contents root → §gea 5.8).
export default class IosConfigSection extends Component {
  template() {
    return <IosBody />
  }
}
