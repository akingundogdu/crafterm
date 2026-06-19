// Text input primitive. Plain <input> with value/placeholder/type.

export interface InputOptions {
  value?: string
  placeholder?: string
  type?: string // default 'text'
}

export function createInput(opts: InputOptions = {}): HTMLInputElement {
  const input = document.createElement('input')
  input.type = opts.type ?? 'text'
  input.value = opts.value ?? ''
  if (opts.placeholder) input.placeholder = opts.placeholder
  return input
}
