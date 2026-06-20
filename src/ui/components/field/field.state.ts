import type { FieldOptions, FieldViewProps } from './field.types'

// Resolves FieldOptions into the values the view binds.
export function resolveFieldProps(opts?: FieldOptions): FieldViewProps {
  return { hint: opts?.hint }
}
