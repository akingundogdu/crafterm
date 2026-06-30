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

export interface CommentPopoverOptions {
  anchorRect: () => DOMRect
  getRange: () => CommentRange | null
  submit: (range: CommentRange, text: string) => Promise<{ ok: boolean; error?: string }>
  onSuccess: (range: CommentRange) => void
}

// Live elements + range the submit routine operates on.
export interface CommentSubmitContext {
  ta: HTMLTextAreaElement
  sendBtn: HTMLButtonElement
  err: HTMLSpanElement
  range: CommentRange
  submit: (range: CommentRange, text: string) => Promise<{ ok: boolean; error?: string }>
  onSuccess: (range: CommentRange) => void
  close: () => void
}
