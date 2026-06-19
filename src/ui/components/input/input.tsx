// Text input primitive. Plain <input> with value/placeholder/type.

export interface InputOptions {
  value?: string
  placeholder?: string
  type?: string // default 'text'
}

export function createInput(opts: InputOptions = {}): HTMLInputElement {
  return (
    <input type={opts.type ?? 'text'} value={opts.value ?? ''} placeholder={opts.placeholder} />
  ) as HTMLInputElement
}
