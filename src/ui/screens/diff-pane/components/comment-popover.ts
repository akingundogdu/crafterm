// Inline PR review-comment popover for the diff pane. Anchored under the comment
// button, it posts a comment on the currently selected line range. The range
// source, the submit action, and the success hook are injected so the popover
// carries no IPC/state imports and is unit-testable.

export interface CommentRange {
  path: string
  a: number
  b: number
}

export interface CommentPopoverHandle {
  open: () => void
  close: () => void
  isOpen: () => boolean
}

export function createCommentPopover(opts: {
  anchorRect: () => DOMRect
  getRange: () => CommentRange | null
  submit: (range: CommentRange, text: string) => Promise<{ ok: boolean; error?: string }>
  onSuccess: (range: CommentRange) => void
}): CommentPopoverHandle {
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
    pop = document.createElement('div')
    pop.className = 'diff-comment-pop'
    const label = document.createElement('div')
    label.className = 'diff-comment-label'
    const loc = range.a === range.b ? `line ${range.a}` : `lines ${range.a}-${range.b}`
    label.textContent = `Comment on ${range.path} · ${loc}`
    const ta = document.createElement('textarea')
    ta.className = 'diff-comment-input'
    ta.placeholder = 'Write a review comment…  (⌘↵ to send, Esc to cancel)'
    ta.spellcheck = false
    const footer = document.createElement('div')
    footer.className = 'diff-comment-footer'
    const err = document.createElement('span')
    err.className = 'diff-comment-err'
    const sendBtn = document.createElement('button')
    sendBtn.className = 'diff-comment-send'
    sendBtn.textContent = 'Comment'
    footer.append(err, sendBtn)
    pop.append(label, ta, footer)

    const submit = async (): Promise<void> => {
      const text = ta.value.trim()
      if (!text) {
        ta.focus()
        return
      }
      sendBtn.disabled = true
      sendBtn.textContent = 'Sending…'
      err.textContent = ''
      const r = await opts.submit(range, text)
      if (r.ok) {
        close()
        opts.onSuccess(range)
      } else {
        sendBtn.disabled = false
        sendBtn.textContent = 'Comment'
        err.textContent = r.error || 'Failed to post comment.'
      }
    }
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void submit()
    })
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void submit()
      }
    })
    pop.addEventListener('mousedown', (e) => e.stopPropagation())

    document.body.appendChild(pop)
    const r = opts.anchorRect()
    const top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8)
    const left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)
    pop.style.top = Math.max(8, top) + 'px'
    pop.style.left = Math.max(8, left) + 'px'
    ta.focus()
    document.addEventListener('mousedown', onOutside, true)
  }

  return { open, close, isOpen: () => pop !== null }
}
