import type { InputOptions } from './input.types'
import { resolveInputProps } from './input.state'

export type { InputOptions } from './input.types'

// Text input primitive. Plain <input> with value/placeholder/type.
export function createInput(opts: InputOptions = {}): HTMLInputElement {
  const p = resolveInputProps(opts)
  return (<input type={p.type} value={p.value} placeholder={p.placeholder} />) as HTMLInputElement
}
