import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { buildSubTabs, labeledInput } from '../shared'
import store from './commands.store'
import PaletteCommandsControl from './components/palette-commands-control'
import MarkdownFoldersControl from './components/markdown-folders-control'
import { saveIdeCommand, saveOpenMyZsh } from './commands.state'

// Commands settings tab. A gea shell (no controller): the static heading is JSX and
// the sub-tabs mount into an imperative host in onAfterRender (SubTabs panels are
// imperative hosts by design). The two dynamic sub-tabs (Markdown folders, Command
// palette) mount reactive gea controls whose lists re-render off commands.store.
// The `display: contents` roots keep the h3 + sub-tab strip as direct flow children
// of `.settings-panel`, so the DOM stays byte-faithful.
class CommandsPanel extends Component {
  host: HTMLDivElement | null = null
  private started = false

  onAfterRender(): void {
    if (this.started || !this.host) return
    this.started = true
    buildSubTabs(this.host, [
      {
        label: UITexts.Settings.commands.general,
        build: (el) => {
          const ide = labeledInput(el, UITexts.Settings.commands.openCodeFile, 'text', settings.commands.ide, saveIdeCommand)
          ide.style.maxWidth = '280px'
          const zsh = labeledInput(el, UITexts.Settings.commands.updateZshConfig, 'text', settings.commands.openMyZsh, saveOpenMyZsh)
          zsh.style.maxWidth = '280px'
          el.insertAdjacentHTML('beforeend', '<div class="field-hint">Shell commands run in a new terminal.</div>')
        }
      },
      {
        label: UITexts.Settings.commands.markdownFolders,
        build: (el) => {
          store.reloadFolders()
          new MarkdownFoldersControl().render(el)
        }
      },
      {
        label: UITexts.Settings.commands.commandPalette,
        build: (el) => {
          store.reloadPalette()
          new PaletteCommandsControl().render(el)
        }
      }
    ])
  }

  template() {
    return (
      <div style={{ display: 'contents' }}>
        <h3>{UITexts.Settings.commands.heading}</h3>
        <div style={{ display: 'contents' }} ref={this.host} />
      </div>
    )
  }
}

export function buildCommandsPanel(panel: HTMLElement): void {
  new CommandsPanel().render(panel)
}
