import type { TextareaOptions, TextareaViewProps } from './textarea.types'

// Resolves TextareaOptions (defaults applied) into the attributes the view binds.
export function resolveTextareaProps(opts: TextareaOptions = {}): TextareaViewProps {
  return {
    value: opts.value ?? '',
    placeholder: opts.placeholder,
    rows: opts.rows
  }
}
