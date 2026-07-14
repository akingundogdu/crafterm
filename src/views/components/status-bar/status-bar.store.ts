// Poll cadences for the status bar chips. Anthropic's usage limits move on the
// order of minutes/hours; the version counter ticks up as code is saved.
export const USAGE_POLL_MS = 3_600_000
// Reading the Claude credential asks macOS for keychain access, and macOS asks the
// user. Doing that the instant the app opens greets every launch with a password
// prompt, so the first read waits until the app has settled (todomrkl5n2rb1).
export const USAGE_FIRST_READ_MS = 180_000
export const VERSION_POLL_MS = 20_000
