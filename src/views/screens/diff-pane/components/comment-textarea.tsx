import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { disableSpellcheck } from './comment-popover.state'

// The comment input textarea for the diff comment popover. Pure view: a gea
// Component builds the node; the factory disables spellcheck and returns it.
class CommentTextareaView extends Component {
  template() {
    return <textarea class="diff-comment-input" placeholder={UITexts.DiffPane.commentPlaceholder} />
  }
}

export function createCommentTextarea(): HTMLTextAreaElement {
  const host = document.createElement('div')
  new CommentTextareaView().render(host)
  const ta = host.firstElementChild as HTMLTextAreaElement
  disableSpellcheck(ta)
  return ta
}
