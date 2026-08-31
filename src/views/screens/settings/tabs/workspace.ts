import { UITexts } from '@texts'
import {
  saveCodeRoot,
  saveDefaultShell,
  saveCodeExtensions,
  saveTodoFile,
  saveExplorerRoot,
  saveExplorerExclude,
  saveKeychainService,
  saveFallbackSecret,
  makeNotifSoundChange
} from './workspace.store'
import { buildCodeRootField } from './components/code-root-field'
import { buildShellField } from './components/shell-field'
import { buildExtensionsField } from './components/extensions-field'
import { buildTodoFileField } from './components/todo-file-field'
import { buildExplorerSection } from './components/explorer-section'
import { buildSoundSelector } from './components/sound-selector'
import { buildClaudeUsageSection } from './components/claude-usage-section'
import { buildWorktreeScriptsSection } from './components/worktree-scripts-section'

export function buildWorkspacePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.workspace.heading}</h3>`)
  buildCodeRootField({ panel, onSave: saveCodeRoot })
  buildShellField({ panel, onSave: saveDefaultShell })
  buildExtensionsField({ panel, onSave: saveCodeExtensions })
  buildTodoFileField({ panel, onSave: saveTodoFile })
  buildExplorerSection({ panel, onSaveRoot: saveExplorerRoot, onSaveExclude: saveExplorerExclude })
  buildWorktreeScriptsSection(panel, null)
  buildSoundSelector({ panel, makeChange: makeNotifSoundChange })
  buildClaudeUsageSection({ panel, onSaveKeychainService: saveKeychainService, onSaveFallbackSecret: saveFallbackSecret })
}
