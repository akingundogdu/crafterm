import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import { disableSpellcheck } from './comment-popover.state'

// The comment input textarea for the diff comment popover. Pure view. Plain-DOM
// (el()) port of the legacy JSX factory (§2.7 self-contained, no @ui).
export function createCommentTextarea(): HTMLTextAreaElement {
  const ta = el('textarea', { class: 'diff-comment-input', placeholder: UITexts.DiffPane.commentPlaceholder })
  disableSpellcheck(ta)
  return ta
}
