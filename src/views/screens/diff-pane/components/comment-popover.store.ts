import { UITexts } from '@texts'
import type { CommentRange, CommentSubmitContext } from './comment-popover.types'

// Human label for a single line vs a multi-line range.
export function locationLabel(range: CommentRange): string {
  return range.a === range.b ? `line ${range.a}` : `lines ${range.a}-${range.b}`
}

export function disableSpellcheck(el: HTMLTextAreaElement): void {
  el.spellcheck = false
}

// Clamps the popover under its anchor, kept inside the viewport.
export function positionPopover(pop: HTMLElement, r: DOMRect): void {
  const top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8)
  const left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)
  pop.style.top = Math.max(8, top) + 'px'
  pop.style.left = Math.max(8, left) + 'px'
}

export function stopMousedown(e: Event): void {
  e.stopPropagation()
}

// The submit routine: validates, disables the button while posting, then closes
// on success or surfaces the error.
export function makeSubmit(c: CommentSubmitContext): () => Promise<void> {
  return async () => {
    const text = c.ta.value.trim()
    if (!text) {
      c.ta.focus()
      return
    }
    c.sendBtn.disabled = true
    c.sendBtn.textContent = UITexts.DiffPane.sending
    c.err.textContent = ''
    const r = await c.submit(c.range, text)
    if (r.ok) {
      c.close()
      c.onSuccess(c.range)
    } else {
      c.sendBtn.disabled = false
      c.sendBtn.textContent = UITexts.DiffPane.comment
      c.err.textContent = r.error || UITexts.DiffPane.failedToPost
    }
  }
}

export function makeSendClick(submit: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    submit()
  }
}

export function makeTextareaKeydown(submit: () => void, close: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }
}
