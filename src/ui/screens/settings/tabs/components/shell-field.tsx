import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface ShellFieldProps {
  panel: HTMLElement
  onSave: (v: string) => void
}

// Default shell field: the program spawned for new terminal panes.
export function buildShellField(props: ShellFieldProps): void {
  const { panel, onSave } = props
  const shell = labeledInput(panel, UITexts.Settings.workspace.defaultShell, 'text', settings.defaultShell, onSave)
  shell.placeholder = '($SHELL, then /bin/zsh)'
  shell.style.maxWidth = '280px'
}
