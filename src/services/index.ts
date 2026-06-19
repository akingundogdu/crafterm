// Renderer IPC service layer — the ONLY place that touches `window.crafterm`.
// Feature code imports these typed, domain-grouped wrappers instead of the raw
// bridge. Callers migrate onto them incrementally (Phase 6); the Phase 4
// namespacing of the bridge stays contained behind `_forward.ts`.

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
