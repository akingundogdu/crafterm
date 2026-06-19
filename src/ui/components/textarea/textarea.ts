// Multi-line text input primitive. Plain <textarea> with value/placeholder/rows.

export interface TextareaOptions {
  value?: string
  placeholder?: string
  rows?: number
}

export function createTextarea(opts: TextareaOptions = {}): HTMLTextAreaElement {
  const textarea = document.createElement('textarea')
  if (opts.rows != null) textarea.rows = opts.rows
  textarea.value = opts.value ?? ''
  if (opts.placeholder) textarea.placeholder = opts.placeholder
  return textarea
}
