// Renderer IPC service layer — the ONLY callers of the generic preload bridge
// (window.crafterm.invoke/send/on). Feature code imports these typed,
// domain-grouped wrappers; each routes to a channel string via the helpers in
// channels.client.ts, with request/response types checked against the central
// channels.ts registry.

export { terminalService } from './terminal/terminal.client'
export { gitService } from './git/git.client'
export { fsService } from './fs/fs.client'
export { claudeService } from './claude/claude.client'
export { notebookService } from './notebook/notebook.client'
export { plansService } from './plans/plans.client'
export { dbService } from './db/db.client'
export { dockerService } from './docker/docker.client'
export { prService } from './pr/pr.client'
export { secretsService } from './secrets/secrets.client'
export { iosService } from './ios/ios.client'
export { appService } from './app/app.client'
export { storeService } from './store/store.client'
