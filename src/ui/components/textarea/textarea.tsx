// Multi-line text input primitive. Plain <textarea> with value/placeholder/rows.

export interface TextareaOptions {
  value?: string
  placeholder?: string
  rows?: number
}

export function createTextarea(opts: TextareaOptions = {}): HTMLTextAreaElement {
  return (
    <textarea rows={opts.rows} placeholder={opts.placeholder}>
      {opts.value ?? ''}
    </textarea>
  ) as HTMLTextAreaElement
}
