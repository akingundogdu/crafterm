import type { ClaudeAccount } from '../claude.types'

// One row in the Claude account switcher: the account label, plus its underlying
// command/value as a subline when present.
export function accountRow(a: ClaudeAccount, onClick: () => void): HTMLButtonElement {
  return (
    <button class="pick-row project-row" onClick={onClick}>
      <span class="picker-name">{a.label}</span>
      {a.value && <span class="project-sub">{a.value}</span>}
    </button>
  ) as HTMLButtonElement
}
