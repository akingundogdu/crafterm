import type { TextareaOptions } from './textarea.types'
import { resolveTextareaProps } from './textarea.state'

export type { TextareaOptions } from './textarea.types'

// Multi-line text input primitive. Plain <textarea> with value/placeholder/rows.
export function createTextarea(opts: TextareaOptions = {}): HTMLTextAreaElement {
  const p = resolveTextareaProps(opts)
  return (
    <textarea rows={p.rows} placeholder={p.placeholder}>
      {p.value}
    </textarea>
  ) as HTMLTextAreaElement
}
