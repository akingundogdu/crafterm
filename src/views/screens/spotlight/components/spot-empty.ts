import { UITexts } from '@texts'

// Renders the `.empty-hint` placeholder shown when the list has no matches or is
// loading, replacing the container's children in place.
export function showEmptyHint(el: HTMLElement, kind: 'no-matches' | 'loading'): void {
  el.replaceChildren()
  const text = kind === 'loading' ? UITexts.Spotlight.loading : UITexts.Spotlight.noMatches
  el.insertAdjacentHTML('beforeend', `<div class="empty-hint">${text}</div>`)
}
