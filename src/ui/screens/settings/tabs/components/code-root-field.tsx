import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface CodeRootFieldProps {
  panel: HTMLElement
  onSave: (v: string) => void
}

// Code root path field: the base folder used when resolving project paths.
export function buildCodeRootField(props: CodeRootFieldProps): void {
  const { panel, onSave } = props
  const root = labeledInput(panel, UITexts.Settings.workspace.codeRoot, 'text', settings.codeRoot, onSave)
  root.placeholder = '(home)'
  root.style.maxWidth = '280px'
}
