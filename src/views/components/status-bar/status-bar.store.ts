// Poll cadences for the status bar chips. Anthropic's usage limits move on the
// order of minutes/hours; the version counter ticks up as code is saved.
export const USAGE_POLL_MS = 3_600_000
export const VERSION_POLL_MS = 20_000
