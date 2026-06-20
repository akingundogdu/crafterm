// Reminder form types.

// A quick time preset chip: label plus a resolver to its absolute timestamp.
export interface QuickPreset {
  label: string
  at: () => number
}
