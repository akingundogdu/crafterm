import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledSelect } from '../../shared'

interface DisplayModeSelectProps {
  panel: HTMLElement
  onChange: (v: string) => void
}

// Tab-display mode select: icon-only, text-only, or icon + text.
export function buildDisplayModeSelect(props: DisplayModeSelectProps): void {
  const { panel, onChange } = props
  labeledSelect(
    panel,
    UITexts.Settings.tabsTab.display,
    [
      ['icon', UITexts.Settings.tabsTab.iconOnly],
      ['text', UITexts.Settings.tabsTab.textOnly],
      ['both', UITexts.Settings.tabsTab.iconText]
    ],
    settings.tabDisplay.mode,
    onChange
  )
}
