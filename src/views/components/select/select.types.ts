// Select primitive types (gea). Kept out of the component file so the gea
// transform only ever sees a single default-export component per .tsx (§5.6).

// An option is either a bare string (value === label) or an explicit value/label
// pair for when the stored value differs from its display text.
export type SelectOption = string | { value: string; label: string }

// Sentinel value carried by the optional "+ New…" choice so callers can detect it.
export const CREATE_OPTION = ' __create__'
