import { Component } from '@geajs/core'
import type { FolderNode, ProjectNode } from '@views/types/types'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { createOverlay } from '@views/components/overlay/overlay'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import './folder-settings-modal.css'

// Per-folder settings modal (startup command / env / shell). Projects also expose
// name/path/command; folders don't. Static per open — no store — so a one-shot gea
// render is enough. `node` + `renderSidebar` arrive via the constructor into plain
// fields (a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`); `renderSidebar` is injected so this piece
// does not import the shell back (avoids a cycle). Self-contained — no @ui (§2.7).
export default class FolderSettingsModal extends Component {
  private readonly node: FolderNode | ProjectNode
  private readonly renderSidebar: () => void
  private readonly onCloseFn: () => void
  private readonly isProject: boolean

  private nameInput: HTMLInputElement | null = null
  private pathInput: HTMLInputElement | null = null
  private commandInput: HTMLInputElement | null = null
  private startupInput: HTMLInputElement | null = null
  private shellInput: HTMLInputElement | null = null
  private envInput: HTMLTextAreaElement | null = null

  constructor(opts: { node: FolderNode | ProjectNode; renderSidebar: () => void; onClose: () => void }) {
    super()
    this.node = opts.node
    this.renderSidebar = opts.renderSidebar
    this.onCloseFn = opts.onClose
    this.isProject = opts.node.kind === 'project'
  }

  // Keep keystrokes inside the fields from reaching the app's global keybindings.
  private stop = (e: KeyboardEvent): void => {
    e.stopPropagation()
  }

  private save = (): void => {
    const node = this.node
    if (this.isProject && this.nameInput && this.pathInput && this.commandInput) {
      const projNode = node as ProjectNode
      const newName = this.nameInput.value.trim()
      if (newName) projNode.name = newName
      projNode.path = this.pathInput.value.trim()
      projNode.command = this.commandInput.value.trim() || undefined
    }
    node.startup = this.startupInput?.value.trim() || undefined
    node.shell = this.shellInput?.value.trim() || undefined
    node.env = this.envInput?.value.trim() || undefined
    persistence.save()
    this.renderSidebar()
    this.onCloseFn()
  }

  onAfterRender(): void {
    ;(this.nameInput ?? this.startupInput)?.focus()
  }

  template() {
    const node = this.node
    const isProject = this.isProject
    const proj = node as ProjectNode
    return (
      <div class="modal modal-prompt">
        <button class="modal-close" type="button" aria-label="Close" title="Close" onClick={() => this.onCloseFn()}>
          ×
        </button>
        <h2>{(isProject ? 'Project settings — ' : 'Folder settings — ') + node.name}</h2>
        {isProject && (
          <div class="field">
            <label>Name</label>
            <input type="text" placeholder="Movve" value={node.name} ref={this.nameInput} onKeyDown={this.stop} />
          </div>
        )}
        {isProject && (
          <div class="field">
            <label>Path</label>
            <input type="text" placeholder="~/code/movve" value={proj.path} ref={this.pathInput} onKeyDown={this.stop} />
          </div>
        )}
        {isProject && (
          <div class="field">
            <label>Command</label>
            <input
              type="text"
              placeholder="claude (run on open, optional)"
              value={proj.command ?? ''}
              ref={this.commandInput}
              onKeyDown={this.stop}
            />
          </div>
        )}
        <div class="field">
          <label>Startup command</label>
          <input type="text" placeholder="e.g. claude" value={node.startup ?? ''} ref={this.startupInput} onKeyDown={this.stop} />
        </div>
        <div class="field">
          <label>Shell</label>
          <input type="text" placeholder="(default)" value={node.shell ?? ''} ref={this.shellInput} onKeyDown={this.stop} />
        </div>
        <div class="field field-col">
          <label>Environment (KEY=VALUE per line)</label>
          <textarea
            class="folder-env"
            placeholder={'FOO=bar\nNODE_ENV=development'}
            rows={4}
            value={node.env ?? ''}
            ref={this.envInput}
            onKeyDown={this.stop}
          />
        </div>
        <div class="modal-actions">
          <button onClick={() => this.onCloseFn()}>{UITexts.Sidebar.cancel}</button>
          <button class="button-primary" onClick={() => this.save()}>
            {UITexts.Sidebar.save}
          </button>
        </div>
      </div>
    )
  }
}

// Opens the gea folder/project settings modal inside a @views overlay backdrop.
// Signature preserved so the context-menu-builder consumer resolves unchanged.
export function showFolderSettings(node: FolderNode | ProjectNode, renderSidebar: () => void): void {
  const ov = createOverlay()
  new FolderSettingsModal({ node, renderSidebar, onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
