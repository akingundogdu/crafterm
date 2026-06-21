import { UITexts } from '@texts'
import { disableSpellcheck } from './comment-popover.state'

// The comment input textarea for the diff comment popover. Pure view.
export function createCommentTextarea(): HTMLTextAreaElement {
  return (
    <textarea class="diff-comment-input" placeholder={UITexts.DiffPane.commentPlaceholder} ref={disableSpellcheck} />
  ) as HTMLTextAreaElement
}
