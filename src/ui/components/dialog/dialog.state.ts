import type { FormField } from './dialog.types'

// keydown handler shared by the prompts: Enter runs onEnter, Escape runs
// onEscape, and propagation is always stopped so modal keys don't leak to the app.
export function makeKeyHandler(
  onEnter: () => void,
  onEscape: () => void
): (e: KeyboardEvent) => void {
  return (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') onEnter()
    else if (e.key === 'Escape') onEscape()
  }
}

// Collects trimmed values for every field; null when the first (required) field
// is blank, which blocks confirmation.
export function collectFormValues(
  fields: FormField[],
  inputs: Record<string, HTMLInputElement>
): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const f of fields) out[f.key] = inputs[f.key].value.trim()
  if (!out[fields[0].key]) return null
  return out
}
