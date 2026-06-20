// Sentinel value carried by the optional "+ New…" choice so callers can detect it.
export const CREATE_OPTION = ' __create__'

// Applies the selected value after the options exist (else the value won't take).
export function applySelectValue(sel: HTMLSelectElement, value?: string): void {
  sel.value = value ?? ''
}
