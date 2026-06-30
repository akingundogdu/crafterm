import { UITexts } from '@texts'
import {
  makeOrientationChange,
  makeFontSizeChange,
  makeDetailToggle,
  makeRecencyToggle
} from './sidebar-tab.state'
import { buildOrientationSelect } from './components/orientation-select'
import { buildFontSizeInput } from './components/font-size-input'
import { buildDetailToggles } from './components/detail-toggles'
import { buildRecencyToggle } from './components/recency-toggle'

export function buildSidebarPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.sidebar.heading}</h3>`)
  buildOrientationSelect({ panel, onChange: makeOrientationChange() })
  buildFontSizeInput({ panel, onChange: makeFontSizeChange() })
  buildDetailToggles({ panel, makeToggle: makeDetailToggle })
  buildRecencyToggle({ panel, makeToggle: makeRecencyToggle })
}
