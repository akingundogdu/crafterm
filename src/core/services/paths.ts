import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'

// Centralized filesystem path resolution for the main process. Every directory
// the app reads/writes is derived here so IPC handlers and services share one
// source of truth instead of re-deriving paths. Paths stay in main (never the
// renderer); system roots (resourcesPath, __dirname) are resolved against the
// packaged vs. dev layout.

// Packaged app and dev mode keep separate state so dev experiments never clobber
// the installed app's saved sessions/layout. Tests/E2E set CRAFTERM_STATE_DIR to a
// throwaway temp dir so they never touch the real ~/.crafterm (HR-5); the default
// is unchanged when the env var is absent.
export const stateDir = (): string =>
  process.env.CRAFTERM_STATE_DIR ||
  join(homedir(), app.isPackaged ? '.crafterm' : '.crafterm-dev')

export const statePath = (): string => join(stateDir(), 'crafterm-state.json')

// Last-command capture (zsh preexec) + the ZDOTDIR shim that installs it.
export const lastCmdDir = (): string => join(stateDir(), 'last-cmd')
export const zdotDir = (): string => join(stateDir(), 'zdotdir')

// Notebook tree root: a free-form folder/.md tree under <stateDir>/notebooks.
export const notebooksDir = (): string => join(stateDir(), 'notebooks')

// Monotonic build counter file (<stateDir>/build-counter.json).
export const buildCounterPath = (): string => join(stateDir(), 'build-counter.json')

// Bundled runtime assets ship via extraResources when packaged and resolve from
// process.resourcesPath; in dev they read from the repo's resources/ dir.
export const runtimeDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'runtime')
    : join(__dirname, '../../src/resources/runtime')

export const soundsDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'sounds')
    : join(__dirname, '../../src/resources/sounds')

// monaco-themes theme JSONs ship via extraResources when packaged; in dev they
// read from node_modules.
export const monacoThemesDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'monaco-themes')
    : join(__dirname, '../../node_modules/monaco-themes/themes')
