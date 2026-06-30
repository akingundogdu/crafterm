import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface ExtensionsFieldProps {
  panel: HTMLElement
  onSave: (v: string) => void
}

// Code extensions field: filename patterns opened with `ide` when clicked.
export function buildExtensionsField(props: ExtensionsFieldProps): void {
  const { panel, onSave } = props
  const ext = labeledInput(
    panel,
    UITexts.Settings.workspace.codeExtensions,
    'text',
    settings.codeExtensions.join(', '),
    onSave
  )
  ext.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Clicking these files in a terminal opens them with <code>ide</code>.</div>'
  )
}
