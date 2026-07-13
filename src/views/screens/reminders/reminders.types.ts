// Reminders screen types (gea tree, §2.7 self-contained copy of the legacy ones).

// A snooze offset offered on a reminder notification card ("remind me later").
export interface SnoozeOption {
  label: string
  at: number
}

// A quick time preset chip in the reminder form: label + a resolver to its
// absolute timestamp.
export interface QuickPreset {
  label: string
  at: () => number
}
