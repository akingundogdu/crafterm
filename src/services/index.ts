// Renderer IPC service layer — the ONLY callers of the generic preload bridge
// (window.crafterm.invoke/send/on). Feature code imports these typed,
// domain-grouped wrappers; each routes to a channel string via the helpers in
// channels.client.ts, with request/response types checked against the central
// channels.ts registry.

export { terminalService } from './terminal/terminal.client'
export { paneService } from './pane/pane.client'
export { gitService } from './git/git.client'
export { fsService } from './fs/fs.client'
export { dirService } from './dir/dir.client'
export { ideService } from './ide/ide.client'
export { shellService } from './shell/shell.client'
export { markdownService } from './markdown/markdown.client'
export { claudeService } from './claude/claude.client'
export { notebookService } from './notebook/notebook.client'
export { plansService } from './plans/plans.client'
export { dbService } from './db/db.client'
export { dbqService } from './dbq/dbq.client'
export { dockerService } from './docker/docker.client'
export { prService } from './pr/pr.client'
export { secretsService } from './secrets/secrets.client'
export { iosService } from './ios/ios.client'
export { appService } from './app/app.client'
export { deployService } from './deploy/deploy.client'
export { monacoService } from './monaco/monaco.client'
export { zshService } from './zsh/zsh.client'
export { todoService } from './todo/todo.client'
export { backlogService } from './backlog/backlog.client'
export { soundService } from './sound/sound.client'
export { storeService } from './store/store.client'

// Renderer-only preload utility (not an IPC channel): resolves a dropped File
// to its absolute path via webUtils.getPathForFile in the preload.
export { pathForFile } from './channels.client'
