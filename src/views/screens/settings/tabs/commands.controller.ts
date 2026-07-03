import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { buildSubTabs, labeledInput } from '../shared'
import store from './commands.store'
import PaletteCommandsControl from './components/palette-commands-control'
import MarkdownFoldersControl from './components/markdown-folders-control'
import { saveIdeCommand, saveOpenMyZsh } from './commands.state'

// Commands settings tab. el-free: the static heading/hints and the General fields go
// through gea helpers (labeledInput) + insertAdjacentHTML, while the two dynamic
// sub-tabs (Markdown folders, Command palette) mount reactive gea controls whose lists
// re-render off commands.store.
export class CommandsPanelController {
  private readonly panel: HTMLElement

  constructor(panel: HTMLElement) {
    this.panel = panel
  }

  build(): void {
    const { panel } = this
    panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.commands.heading}</h3>`)
    buildSubTabs(panel, [
      {
        label: UITexts.Settings.commands.general,
        build: (el) => {
          const ide = labeledInput(el, UITexts.Settings.commands.openCodeFile, 'text', settings.commands.ide, saveIdeCommand)
          ide.style.maxWidth = '280px'
          const zsh = labeledInput(el, UITexts.Settings.commands.updateZshConfig, 'text', settings.commands.openMyZsh, saveOpenMyZsh)
          zsh.style.maxWidth = '280px'
          el.insertAdjacentHTML(
            'beforeend',
            '<div class="field-hint">Shell commands run in a new terminal.</div>'
          )
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
}
