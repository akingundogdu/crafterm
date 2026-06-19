import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { loadScript } from './services/scripts'
import { lastCmdDir, zdotDir, scriptsDir } from './services/paths'
import * as terminal from './services/terminal.manager'
import * as plansWatcher from './services/plans.watcher'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { APP_NAME } from './constants'
import { registerDbIpc } from '@services/db/db.main'
import { registerDockerIpc } from '@services/docker/docker.main'
import { registerPrIpc } from '@services/pr/pr.main'
import { registerFsIpc } from '@services/fs/fs.main'
import { registerNotebookIpc } from '@services/notebook/notebook.main'
import { registerShellIpc } from '@services/shell/shell.main'
import { registerSoundIpc } from '@services/sound/sound.main'
import { registerStoreIpc } from '@services/store/store.main'
import { registerSecretsIpc } from '@services/secrets/secrets.main'
import { registerGitIpc } from '@services/git/git.main'
import { registerPaneIpc } from '@services/pane/pane.main'
import { registerClaudeIpc } from '@services/claude/claude.main'
import { registerDirIpc } from '@services/dir/dir.main'
import { registerIdeIpc } from '@services/ide/ide.main'
import { registerPlansIpc } from '@services/plans/plans.main'
import { registerDbqIpc } from '@services/dbq/dbq.main'
import { registerDeployIpc } from '@services/deploy/deploy.main'
import { registerAppIpc } from '@services/app/app.main'
import { registerMarkdownIpc } from '@services/markdown/markdown.main'
import { registerMdIpc } from '@services/md/md.main'
import { registerMonacoIpc } from '@services/monaco/monaco.main'
import { registerTodoIpc } from '@services/todo/todo.main'
import { registerBacklogIpc } from '@services/backlog/backlog.main'
import { registerZshIpc } from '@services/zsh/zsh.main'
import { registerIosIpc } from '@services/ios/ios.main'
import { registerTerminalIpc } from '@services/terminal/terminal.main'
import { emit } from '@services/channels.main'
import {
  createMainWindow,
  getMainWindow,
  setQuitting,
  buildAppMenu,
  registerWindowIpc
} from './windows'

// macOS uses this for the app menu / notification name; set it before whenReady.
app.setName(APP_NAME)

// Database tool: Postgres/MySQL/SQLite connect + query IPC (db:*).
registerDbIpc()

// Docker tool: containers/images/volumes/networks/compose + actions (docker:*).
registerDockerIpc()

// PR panel: GitHub PR list + CI checks + merge via the gh CLI (pr:*).
registerPrIpc()

// Filesystem bridge: file explorer + code editor + link finders (fs:*).
registerFsIpc()

// Notebook tree (notebook:*), OS path open/reveal (shell:*, open-external),
// sounds (sound:*).
registerNotebookIpc()
registerShellIpc()
registerSoundIpc()

// JSON store (store:*) + safeStorage secrets (secrets:*).
registerStoreIpc()
registerSecretsIpc()

// Git pickers/decorations/worktrees (git:*) + pane info (pane:*).
registerGitIpc()
registerPaneIpc()

// Claude usage + session history (claude:*).
registerClaudeIpc()

// Folder picker (dir:*), IDE open (ide:*), plan files (plans:*).
registerDirIpc()
registerIdeIpc()
registerPlansIpc()

// Saved SQL queries (dbq:*), self-update (deploy:*), app info (app:*).
registerDbqIpc()
registerDeployIpc()
registerAppIpc()

// Markdown open (markdown:*) + finder (md:*), monaco themes (monaco:*).
registerMarkdownIpc()
registerMdIpc()
registerMonacoIpc()

// todo-list.md (todo:*), backlog (backlog:*), zsh commands (zsh:*).
registerTodoIpc()
registerBacklogIpc()
registerZshIpc()

// iOS worktree build/run + targets/schemes (ios:* / iosWorktree:*).
registerIosIpc()

// Terminal/PTY + background processes (pty:* / proc:*).
registerTerminalIpc()

// Window management: pop-out windows, the Improve panel, native notifications.
registerWindowIpc()

// --- Last-command capture (zsh preexec) -------------------------------------
// A ZDOTDIR shim installs a `preexec` hook that records each command run in a
// pane to <stateDir>/last-cmd/<CRAFTERM_PANE_ID>. On restore the renderer
// pre-types it for raw (non-Claude) panes so the user can resume where they left
// off. Best-effort: if the shim fails to install, terminals still work normally.
let shellIntegrationReady = false

// Generate the ZDOTDIR shim. Each shim file sources the user's real rc (from
// $USER_ZDOTDIR, defaulting to $HOME) so aliases/PATH/prompt stay intact, then
// .zshrc appends our preexec hook and restores ZDOTDIR so nested shells are
// untouched. Every source is guarded with `[ -f ]` so an unusual zsh setup still
// yields a working shell.
function setupShellIntegration(): void {
  try {
    mkdirSync(lastCmdDir(), { recursive: true })
    const dir = zdotDir()
    mkdirSync(dir, { recursive: true })
    const templates = join(scriptsDir(), 'templates')
    // .zshenv runs for every shell. A user .zshenv may itself set ZDOTDIR, so the
    // shim snapshots the shim dir first and reasserts it afterwards (see template).
    writeFileSync(join(dir, '.zshenv'), loadScript(templates, 'claude-shim.zshenv.tmpl'))
    writeFileSync(join(dir, '.zprofile'), loadScript(templates, 'claude-shim.zprofile.tmpl'))
    const cmdDir = lastCmdDir().replace(/(["\\$`])/g, '\\$1')
    writeFileSync(join(dir, '.zshrc'), loadScript(templates, 'claude-shim.zshrc.tmpl', { cmdDir }))
    shellIntegrationReady = true
  } catch {
    shellIntegrationReady = false
  }
}
setupShellIntegration()

// Last-resort guard: a stray teardown error (e.g. a PTY firing onExit just as the
// window is destroyed) should be logged, not surfaced as a blocking dialog and
// not crash the app.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err)
})

app.whenReady().then(() => {
  // Wire the terminal manager to index-owned state (main window + ZDOTDIR shim).
  terminal.init({
    getMainWindow,
    isShellIntegrationReady: () => shellIntegrationReady,
    getZdotDir: zdotDir
  })
  // Packaged builds use the bundled .icns; set the dock icon manually in dev so
  // the app shows the Crafterm logo while running via `npm run dev`.
  if (!app.isPackaged && process.platform === 'darwin') {
    try {
      const iconPath = join(app.getAppPath(), 'src/resources/images/crafterm-logo.png')
      if (existsSync(iconPath)) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
    } catch {
      // ignore: dock icon is a dev-only nicety
    }
  }
  buildAppMenu()
  // Belt-and-suspenders against accidental Cmd+R reloads (in addition to the
  // custom View menu that omits the Reload role). Catches any stray reload
  // accelerator from devtools, webviews, or pop-out windows before it fires.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (!(input.control || input.meta)) return
      if (input.key.toLowerCase() === 'r') event.preventDefault()
    })
  })
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let didFlushState = false
app.on('before-quit', (e) => {
  setQuitting()
  plansWatcher.closeAll()
  const mainWindow = getMainWindow()
  // First pass: let the renderer persist its CURRENT (correct) tree before any
  // PTY is killed. Killing PTYs makes the renderer close panes, which would
  // otherwise overwrite the saved state with an empty tree — breaking restore.
  if (
    !didFlushState &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    e.preventDefault()
    emit(mainWindow.webContents, 'app:quitting')
    setTimeout(() => {
      didFlushState = true
      app.quit()
    }, 200)
    return
  }
  // Second pass: drain every live PTY (kill + await its real exit) BEFORE the
  // Node environment tears down. Killing them inline and returning lets Electron
  // start teardown immediately; node-pty then fires exit callbacks into a
  // half-destroyed env and aborts the process. Draining first empties `ptys` so
  // nothing fires during the actual teardown. Re-entrant: once drained the map
  // is empty, so the final before-quit pass falls through and the quit proceeds.
  if (terminal.count() > 0) {
    e.preventDefault()
    terminal.drain().then(() => app.quit())
  }
})
