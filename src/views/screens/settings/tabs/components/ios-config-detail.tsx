import { Component } from '@geajs/core'
import type { IosDevConfig } from '@views/types/types'
import type { IosConfigKey } from '../projects.types'
import LabeledTextField from '../../components/labeled-text-field'
import IosCopyFileRow from './ios-copy-file-row'
import store from './ios-config-section.store'

// The auto-detecting text fields under the iOS toggle: label + config key + hint.
const IOS_FIELDS: { label: string; key: IosConfigKey; placeholder: string }[] = [
  { label: 'Xcode project / workspace', key: 'project', placeholder: 'auto: discovered (.xcworkspace/.xcodeproj)' },
  { label: 'Scheme', key: 'scheme', placeholder: 'auto: xcodebuild -list' },
  { label: 'Base bundle identifier', key: 'baseBundleId', placeholder: 'auto: from build settings, e.g. com.acme.app' },
  { label: 'Display name prefix', key: 'displayPrefix', placeholder: 'auto: scheme name' },
  { label: 'Default simulator', key: 'defaultSimulator', placeholder: 'auto: booted, else first iPhone' },
  { label: 'Worktrees directory', key: 'worktreesDir', placeholder: 'auto: <repo parent>/worktrees' }
]

export interface IosConfigDetailProps {
  path: string
  cfg: IosDevConfig
  onPathChange: (v: string) => void
  onFieldChange: (key: IosConfigKey, v: string) => void
  onAddFile: () => void
  onDeleteFile: (index: number) => void
}

// The revealed iOS config body (shown only when the iOS toggle is on): the repo-path
// field, the auto-detecting Xcode fields, and the "copy into new worktrees" list.
// Extracted into its own Component so its keyed copy-files `.map()` renders on this
// component's INITIAL mount (when the toggle flips on) rather than materializing behind
// a conditional in the parent — §gea 5.2. The path/config text fields are uncontrolled
// (read-only props); the reactive copy-files list is read from `store.copyFiles`.
export default class IosConfigDetail extends Component {
  declare props: IosConfigDetailProps

  template({ path, cfg, onPathChange, onFieldChange, onAddFile, onDeleteFile }: this['props']) {
    return (
      <div style={{ display: 'contents' }}>
        <LabeledTextField
          label="iOS repo path"
          value={path}
          placeholder="/Users/you/path/to/your-ios-repo"
          controlStyle={{ maxWidth: '420px' }}
          onChange={onPathChange}
        />
        {!path && (
          <div class="field-hint" style={{ color: 'var(--amber,#e0a44a)' }}>
            Required: set this to the iOS app’s git repository.
          </div>
        )}
        <div class="field-hint">The fields below auto-detect from the Xcode project when left empty.</div>
        {IOS_FIELDS.map((f) => (
          <LabeledTextField
            key={f.key}
            label={f.label}
            value={cfg[f.key]}
            placeholder={f.placeholder}
            controlStyle={{ maxWidth: '420px' }}
            onChange={(v: string) => onFieldChange(f.key, v)}
          />
        ))}
        <div class="field" style={{ marginTop: '14px' }}>
          <label>Copy into new worktrees</label>
        </div>
        <div class="field-hint">
          Gitignored local files (paths relative to the repo root) copied from the main checkout, e.g. Secrets.xcconfig.
        </div>
        <button class="settings-inline-btn" onClick={onAddFile}>
          + Add file
        </button>
        <div class="palette-admin-list">
          {store.copyFiles.length === 0 && <div class="field-hint">No files yet.</div>}
          {store.copyFiles.map((rel, i) => (
            <IosCopyFileRow key={rel + i} rel={rel} onDelete={() => onDeleteFile(i)} />
          ))}
        </div>
      </div>
    )
  }
}
