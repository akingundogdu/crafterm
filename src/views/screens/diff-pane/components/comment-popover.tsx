import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { CommentPopoverHandle, CommentPopoverOptions } from './comment-popover.types'
import {
  locationLabel,
  positionPopover,
  stopMousedown,
  makeSubmit,
  makeSendClick,
  makeTextareaKeydown
} from './comment-popover.store'
import { createCommentTextarea } from './comment-textarea'

export type { CommentRange, CommentPopoverHandle } from './comment-popover.types'

// The popover shell markup (label + footer with the error span and the Comment
// button). A gea Component; the textarea (an imperatively built node) is inserted
// between the label and footer by the factory. Data arrives via the constructor
// into a plain field. Self-contained (§2.7).
class CommentPopView extends Component {
  errEl: HTMLSpanElement | null = null
  sendBtnEl: HTMLButtonElement | null = null
  footerEl: HTMLDivElement | null = null
  private readonly label: string

  constructor(opts: { label: string }) {
    super()
    this.label = opts.label
  }

  template() {
    return (
      <div class="diff-comment-pop" onMouseDown={stopMousedown}>
        <div class="diff-comment-label">{this.label}</div>
        <div class="diff-comment-footer" ref={this.footerEl}>
          <span class="diff-comment-err" ref={this.errEl} />
          <button class="diff-comment-send" ref={this.sendBtnEl}>
            {UITexts.DiffPane.comment}
          </button>
        </div>
      </div>
    )
  }
}

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
    const view = new CommentPopView({ label: `Comment on ${range.path} · ${locationLabel(range)}` })
    const host = document.createElement('div')
    view.render(host)
    pop = host.firstElementChild as HTMLElement
    const err = view.errEl as HTMLSpanElement
    const sendBtn = view.sendBtnEl as HTMLButtonElement
    pop.insertBefore(ta, view.footerEl as HTMLDivElement)

    const submit = makeSubmit({ ta, sendBtn, err, range, submit: opts.submit, onSuccess: opts.onSuccess, close })
    sendBtn.addEventListener('click', makeSendClick(submit))
    ta.addEventListener('keydown', makeTextareaKeydown(submit, close))

    document.body.appendChild(pop)
    positionPopover(pop, opts.anchorRect())
    ta.focus()
    document.addEventListener('mousedown', onOutside, true)
  }

  return { open, close, isOpen: () => pop !== null }
}
