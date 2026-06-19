// Renderer IPC service layer — the ONLY place that touches `window.crafterm`.
// Feature code imports these typed, domain-grouped wrappers instead of the raw
// bridge. Callers migrate onto them incrementally (Phase 6); the Phase 4
// namespacing of the bridge stays contained behind `_forward.ts`.

export { terminalService } from './terminal.service'
export { gitService } from './git.service'
export { fsService } from './fs.service'
export { claudeService } from './claude.service'
export { notebookService } from './notebook.service'
export { plansService } from './plans.service'
export { dbService } from './db.service'
export { dockerService } from './docker.service'
export { prService } from './pr.service'
export { secretsService } from './secrets.service'
export { iosService } from './ios.service'
export { appService } from './app.service'
export { storeService } from './store.service'
