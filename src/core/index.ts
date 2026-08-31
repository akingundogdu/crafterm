import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { loadScript } from './services/scripts/scripts.service'
import { lastCmdDir, zdotDir, runtimeDir } from './services/paths/paths.service'
import { hydrateEnvPath } from './services/exec/exec.service'
import * as terminal from './services/terminal.manager/terminal.manager.service'
import * as plansWatcher from './services/plans.watcher/plans.watcher.service'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { APP_NAME } from './constants/constants'
import { Events } from './events/events'
import type { BaseService } from '@services/base.service'
import { DbController } from '@services/db/db.main'
import { DockerController } from '@services/docker/docker.main'
import { PrController } from '@services/pr/pr.main'
import { FsController } from '@services/fs/fs.main'
import { NotebookController } from '@services/notebook/notebook.main'
import { ShellController } from '@services/shell/shell.main'
import { SoundController } from '@services/sound/sound.main'
import { StoreController } from '@services/store/store.main'
import { SecretsController } from '@services/secrets/secrets.main'
import { GitController } from '@services/git/git.main'
import { PaneController } from '@services/pane/pane.main'
import { ClaudeController } from '@services/claude/claude.main'
import { DirController } from '@services/dir/dir.main'
import { IdeController } from '@services/ide/ide.main'
import { PlansController } from '@services/plans/plans.main'
import { DbqController } from '@services/dbq/dbq.main'
import { DeployController } from '@services/deploy/deploy.main'
import { AppController } from '@services/app/app.main'
import { MarkdownController } from '@services/markdown/markdown.main'
import { MonacoController } from '@services/monaco/monaco.main'
import { TodoController } from '@services/todo/todo.main'
import { BacklogController } from '@services/backlog/backlog.main'
import { ZshController } from '@services/zsh/zsh.main'
import { IosController } from '@services/ios/ios.main'
import { TerminalController } from '@services/terminal/terminal.main'
import { SystemController } from '@services/system/system.main'
import { emit, Channel } from '@services/channels.main'
import {
  createMainWindow,
  getMainWindow,
  setQuitting,
  buildAppMenu,
  registerWindowIpc
} from './windows'

// macOS uses this for the app menu / notification name; set it before whenReady.
app.setName(APP_NAME)

// Resolve the user's real PATH before anything spawns a process, so tools a
// child looks up by name (git-lfs during a worktree checkout) are found even
// when the app was launched from the Dock. No-op when launched from a shell.
hydrateEnvPath()

// Every domain IPC service (#11): each is a BaseService whose register() binds its
// channel handlers. Instantiated once here; setup?() runs before register() and
// dispose?() on before-quit. Adding a service = one entry in this array.
const services: BaseService[] = [
  new DbController(), // db:* — Postgres/MySQL/SQLite connect + query
  new DockerController(), // docker:* — containers/images/volumes/networks/compose
  new PrController(), // pr:* / gh:* — GitHub PRs + CI checks + merge
  new FsController(), // fs:* — file explorer + code editor + link finders
  new NotebookController(), // notebook:* — notebook tree
  new ShellController(), // shell:* — OS path open/reveal + open-external
  new SoundController(), // sound:* — notification sounds
  new StoreController(), // store:* — JSON state store
  new SecretsController(), // secrets:* — safeStorage secrets
  new GitController(), // git:* — pickers/decorations/worktrees
  new PaneController(), // pane:* — pane info
  new ClaudeController(), // claude:* — usage + session history
  new DirController(), // dir:* — folder picker
  new IdeController(), // ide:* — open in IDE
  new PlansController(), // plans:* — plan files
  new DbqController(), // dbq:* — saved SQL queries
  new DeployController(), // deploy:* — self-update
  new AppController(), // app:* — app info + lifecycle
  new MarkdownController(), // markdown:* — open + .md finder
  new MonacoController(), // monaco:* — editor themes
  new TodoController(), // todo:* — todo-list.md
  new BacklogController(), // backlog:* — backlog file
  new ZshController(), // zsh:* — zsh aliases/functions
  new IosController(), // ios:* / iosWorktree:* — build/run + targets/schemes
  new TerminalController(), // pty:* / proc:* — terminal + background processes
  new SystemController() // system:* — machine CPU/memory + top processes
]
for (const service of services) {
  service.setup?.()
  service.register()
}

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
    const templates = join(runtimeDir(), 'templates')
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
process.on(Events.Process.UncaughtException, (err) => {
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
  app.on(Events.App.WebContentsCreated, (_e, wc) => {
    wc.on(Events.WebContents.BeforeInputEvent, (event, input) => {
      if (input.type !== 'keyDown') return
      if (!(input.control || input.meta)) return
      if (input.key.toLowerCase() === 'r') event.preventDefault()
    })
  })
  createMainWindow()
  app.on(Events.App.Activate, () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on(Events.App.WindowAllClosed, () => {
  if (process.platform !== 'darwin') app.quit()
})

let didFlushState = false
app.on(Events.App.BeforeQuit, (e) => {
  setQuitting()
  plansWatcher.closeAll()
  for (const service of services) service.dispose?.()
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
    emit(mainWindow.webContents, Channel.App.Quitting)
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
