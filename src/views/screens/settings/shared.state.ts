// Shared state + helpers for the settings panels. `settingsCleanups` is a stable
// array (cleared in place by openSettings) holding teardown callbacks run when the
// modal closes — e.g. stopping shortcut recording.
export const settingsCleanups: (() => void)[] = []

// Normalizes a CSS color to a 6-digit hex (#rgb → #rrggbb), defaulting to black.
export function toHex6(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  return '#000000'
}

// `change` handlers that read the control's current value and forward it.
export function makeInputChange(onChange: (v: string) => void): (e: Event) => void {
  return (e) => onChange((e.currentTarget as HTMLInputElement).value)
}

export function makeSelectChange(onChange: (v: string) => void): (e: Event) => void {
  return (e) => onChange((e.currentTarget as HTMLSelectElement).value)
}
