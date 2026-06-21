import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface FontSizeInputProps {
  panel: HTMLElement
  onChange: (v: string) => void
}

// Sidebar font-size numeric input.
export function buildFontSizeInput(props: FontSizeInputProps): void {
  const { panel, onChange } = props
  labeledInput(
    panel,
    UITexts.Settings.sidebar.fontSize,
    'number',
    String(settings.sidebar.fontSize),
    onChange
  )
}
