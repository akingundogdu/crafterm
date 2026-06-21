import { UITexts } from '@texts'
import type { CommentPopoverHandle, CommentPopoverOptions } from './comment-popover.types'
import {
  locationLabel,
  positionPopover,
  stopMousedown,
  makeSubmit,
  makeSendClick,
  makeTextareaKeydown
} from './comment-popover.state'
import { createCommentTextarea } from './comment-textarea'

export type { CommentRange, CommentPopoverHandle } from './comment-popover.types'

// Inline PR review-comment popover for the diff pane. Anchored under the comment
// button, it posts a comment on the currently selected line range. The range
// source, the submit action, and the success hook are injected so the popover
// carries no IPC/state imports and is unit-testable.
export function createCommentPopover(opts: CommentPopoverOptions): CommentPopoverHandle {
  let pop: HTMLElement | null = null

  const onOutside = (e: MouseEvent): void => {
    if (pop && !pop.contains(e.target as Node)) close()
  }

  function close(): void {
    if (!pop) return
    pop.remove()
    pop = null
    document.removeEventListener('mousedown', onOutside, true)
  }

  const open = (): void => {
    close()
    const range = opts.getRange()
    if (!range) return
    const ta = createCommentTextarea()
    const err = (<span class="diff-comment-err" />) as HTMLSpanElement
    const sendBtn = (<button class="diff-comment-send">{UITexts.DiffPane.comment}</button>) as HTMLButtonElement
    pop = (
      <div class="diff-comment-pop">
        <div class="diff-comment-label">{`Comment on ${range.path} · ${locationLabel(range)}`}</div>
        {ta}
        <div class="diff-comment-footer">
          {err}
          {sendBtn}
        </div>
      </div>
    ) as HTMLElement

    const submit = makeSubmit({ ta, sendBtn, err, range, submit: opts.submit, onSuccess: opts.onSuccess, close })
    sendBtn.addEventListener('click', makeSendClick(submit))
    ta.addEventListener('keydown', makeTextareaKeydown(submit, close))
    pop.addEventListener('mousedown', stopMousedown)

    document.body.appendChild(pop)
    positionPopover(pop, opts.anchorRect())
    ta.focus()
    document.addEventListener('mousedown', onOutside, true)
  }

  return { open, close, isOpen: () => pop !== null }
}
