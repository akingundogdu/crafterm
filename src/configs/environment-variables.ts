// Centralized environment-variable access for the main process. Reads go through
// lazy getters — env values can change after this module loads (tests set
// CRAFTERM_STATE_DIR before the app reads it), so values are NEVER cached at
// import time. Names the app INJECTS into spawned ptys / child processes live in
// ENV_NAMES so the inject sites reference one source too.

const read = (name: string): string | undefined => process.env[name]

export const env = {
  // E2E run flag (Playwright launches the window hidden/windowed).
  isE2E: (): boolean => !!read('CRAFTERM_E2E'),
  // Vite dev-server URL set by electron-vite in dev; absent in packaged builds.
  rendererUrl: (): string | undefined => read('ELECTRON_RENDERER_URL'),
  // Throwaway state dir override (tests/E2E); falls back to ~/.crafterm(-dev) in paths.
  stateDir: (): string | undefined => read('CRAFTERM_STATE_DIR'),
  // The user's login shell.
  shell: (): string | undefined => read('SHELL'),
  // The user's real ZDOTDIR (so the shell-integration shim can re-point to it).
  zdotDir: (): string | undefined => read('ZDOTDIR')
}

// Env var names the app sets when spawning ptys / child processes.
export const ENV_NAMES = {
  PaneId: 'CRAFTERM_PANE_ID',
  UserZdotdir: 'USER_ZDOTDIR',
  Zdotdir: 'ZDOTDIR'
} as const
