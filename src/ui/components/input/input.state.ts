import type { InputOptions, InputViewProps } from './input.types'

// Resolves InputOptions (defaults applied) into the attributes the view binds.
export function resolveInputProps(opts: InputOptions = {}): InputViewProps {
  return {
    type: opts.type ?? 'text',
    value: opts.value ?? '',
    placeholder: opts.placeholder
  }
}
