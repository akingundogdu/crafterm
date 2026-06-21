import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledSelect } from '../../shared'

interface OrientationSelectProps {
  panel: HTMLElement
  onChange: (v: string) => void
}

// Sidebar orientation select: vertical (left) vs horizontal (top).
export function buildOrientationSelect(props: OrientationSelectProps): void {
  const { panel, onChange } = props
  labeledSelect(
    panel,
    UITexts.Settings.sidebar.position,
    [
      ['left', UITexts.Settings.sidebar.verticalLeft],
      ['top', UITexts.Settings.sidebar.horizontalTop]
    ],
    settings.sidebar.orientation,
    onChange
  )
}
