import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledInput, labeledSelect } from '../../shared'
import { buildSecretOptions, currentFallbackSecret } from '../workspace.store'

interface ClaudeUsageSectionProps {
  panel: HTMLElement
  onSaveKeychainService: (v: string) => void
  onSaveFallbackSecret: (v: string) => void
}

// Claude usage section — token source for the real `/api/oauth/usage` percentages.
export function buildClaudeUsageSection(props: ClaudeUsageSectionProps): void {
  const { panel, onSaveKeychainService, onSaveFallbackSecret } = props
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.claudeUsage}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">The status-bar chip shows Anthropic\'s real session/week limits, read with the OAuth token Claude Code stores in the macOS keychain. Override the keychain service or point at a saved secret as a fallback.</div>'
  )
  const svc = labeledInput(
    panel,
    UITexts.Settings.workspace.keychainService,
    'text',
    settings.claudeUsageAuth.keychainService,
    onSaveKeychainService
  )
  svc.style.maxWidth = '260px'
  svc.placeholder = 'Claude Code-credentials'

  labeledSelect(panel, UITexts.Settings.workspace.fallbackSecret, buildSecretOptions(), currentFallbackSecret(), onSaveFallbackSecret)
}
