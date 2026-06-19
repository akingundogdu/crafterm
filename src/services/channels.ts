// Single source of truth for the entire IPC surface. PURE: no electron, no DOM —
// safe to import from both the main and renderer bundles. The process-specific
// typed wrappers live in channels.main.ts (handle/on/emit) and channels.client.ts
// (call/send/listen); both derive their param + return types from this registry,
// so a channel typo or a main↔client type drift fails at compile time.
//
// Channel-string format stays Electron-conventional ('<domain>:<verb>'); only the
// *location* (here, not scattered) and *typing* change. The req/res type
// definitions are imported from each domain's *.types.ts — central wiring,
// dispersed types.
import type {
  PtyCreateOptions,
  ProcStartOptions,
  PaneInfo,
  PtyDataEvent,
  ProcExitEvent
} from './pty/pty.types'
import type { GitStash, GitFileStatus, WorktreeListing } from './git/git.types'
import type {
  DirEntry,
  DirListing,
  FsEntryListing,
  MarkdownFiles,
  ReadTextResult,
  ImportResolution
} from './fs/fs.types'
import type {
  ClaudeSession,
  ClaudeSessionStatus,
  ClaudeUsageSummary,
  ClaudeRealUsage,
  ClaudeRealUsageOptions
} from './claude/claude.types'
import type { NbNode } from './notebook/notebook.types'
import type { PlanForBranch, PlanScanEntry } from './plans/plans.types'
import type { DbConfig, DbObjects, DbColumns, DbResult, SavedQueryRef } from './db/db.types'
import type {
  DockerKind,
  DockerRow,
  DockerAvailable,
  DockerActionResult,
  DockerPruneResult
} from './docker/docker.types'
import type {
  PullRequest,
  WorkflowRun,
  DeploymentStatus,
  ProjectPullRequests,
  ProjectDeployments
} from './pr/pr.types'
import type { SecretsResult } from './secrets/secrets.types'
import type { IosWorktreeReport, IosTargets, SavedIosConfig } from './ios/ios.types'
import type { BuildInfo, RepoGit, DeployResult, ZshCommand, BacklogFile } from './app/app.types'
import type { SavedState } from './storage/state.types'

// ---- Channel-kind markers (phantom-typed; carry no runtime payload) ----
// rpc = request/response (invoke ↔ handle). msg = renderer→main one-way (send ↔ on).
// evt = main→renderer push (webContents.send ↔ on).
export const rpc = <Req, Res>(): { kind: 'rpc'; __req: Req; __res: Res } => ({ kind: 'rpc' }) as never
export const msg = <Req>(): { kind: 'msg'; __req: Req } => ({ kind: 'msg' }) as never
export const evt = <Payload>(): { kind: 'evt'; __payload: Payload } => ({ kind: 'evt' }) as never

export const channels = {
  // ── terminal / pty ──
  'pty:create': rpc<PtyCreateOptions, string>(),
  'pty:input': msg<{ id: string; data: string }>(),
  'pty:resize': msg<{ id: string; cols: number; rows: number }>(),
  'pty:kill': msg<{ id: string }>(),
  'pty:adopt': msg<{ id: string }>(),
  'pty:data': evt<PtyDataEvent>(),
  'pty:exit': evt<{ id: string }>(),
  'pane:info': rpc<{ id: string; stableId?: string }, PaneInfo>(),
  'menu:close-pane': evt<void>(),
  'focus-pane': evt<{ id: string }>(),
  'popout:open': rpc<{ paneId: string; title?: string }, void>(),
  'popout:close-confirmed': msg<{ id: string }>(),
  'popout:focus': msg<{ id: string }>(),
  'popout:killed': evt<{ id: string }>(),
  'popout:confirm-close': evt<{ id: string }>(),
  'proc:start': rpc<ProcStartOptions, string>(),
  'proc:buffer': rpc<{ id: string }, string>(),
  'proc:attach': msg<{ id: string }>(),
  'proc:exit': evt<ProcExitEvent>(),

  // ── git ──
  'git:branches': rpc<{ id: string }, string[]>(),
  'git:stashList': rpc<{ id: string }, GitStash[]>(),
  'git:fileStatus': rpc<{ cwd?: string }, GitFileStatus>(),
  'git:worktrees': rpc<{ cwd?: string }, WorktreeListing>(),
  'git:worktreeAdd': rpc<
    { repo: string; path: string; branch: string; base?: string },
    boolean
  >(),

  // ── fs (dir/md/fs/ide/shell/markdown) ──
  'dir:list': rpc<{ path?: string }, DirListing>(),
  'fs:listEntries': rpc<{ path?: string }, FsEntryListing>(),
  'md:findAll': rpc<{ root?: string }, MarkdownFiles>(),
  'fs:findFiles': rpc<{ root?: string; exclude?: string[] }, MarkdownFiles>(),
  'fs:resolveFile': rpc<{ base: string; rel: string }, string | null>(),
  'fs:readMd': rpc<{ path: string }, string>(),
  'fs:readText': rpc<{ path: string }, ReadTextResult>(),
  'fs:writeMd': rpc<{ path: string; content: string }, boolean>(),
  'fs:writeText': rpc<{ path: string; content: string }, boolean>(),
  'fs:createFile': rpc<{ path: string }, boolean>(),
  'fs:mkdir': rpc<{ path: string }, boolean>(),
  'fs:rename': rpc<{ from: string; to: string }, boolean>(),
  'fs:trash': rpc<{ path: string }, boolean>(),
  'fs:resolveImport': rpc<
    { fromFile: string; spec: string; symbol?: string },
    ImportResolution | null
  >(),
  'ide:open': msg<{ path: string; ide: string }>(),
  'shell:openPath': msg<{ path: string }>(),
  'shell:revealPath': msg<{ path: string }>(),
  'markdown:open': msg<{ path: string }>(),

  // ── claude ──
  'claude:latestSession': rpc<{ cwd?: string; since?: number }, string | null>(),
  'claude:sessionCwd': rpc<{ sessionId: string }, string | null>(),
  'claude:sessions': rpc<void, ClaudeSession[]>(),
  'claude:sessionTitle': rpc<{ cwd: string; sessionId: string }, string | null>(),
  'claude:sessionStatus': rpc<
    { cwd: string; sessionId: string },
    ClaudeSessionStatus | null
  >(),
  'claude:permissionMode': rpc<{ cwd: string; sessionId: string }, string | null>(),
  'claude:watchSessions': rpc<{ cwd: string }, boolean>(),
  'claude:sessionsChanged': evt<{ cwd: string }>(),
  'claude:usageSummary': rpc<void, ClaudeUsageSummary>(),
  'claude:realUsage': rpc<ClaudeRealUsageOptions, ClaudeRealUsage>(),

  // ── notebook ──
  'notebook:tree': rpc<void, NbNode[]>(),
  'notebook:read': rpc<{ path: string }, string>(),
  'notebook:write': msg<{ path: string; content: string }>(),
  'notebook:mkdir': rpc<{ path: string }, boolean>(),
  'notebook:create': rpc<{ path: string }, boolean>(),
  'notebook:rename': rpc<{ path: string; name: string }, boolean>(),
  'notebook:move': rpc<{ src: string; destDir: string }, boolean>(),
  'notebook:delete': rpc<{ path: string }, boolean>(),
  'notebook:reveal': msg<{ path: string }>(),

  // ── plans ──
  'plans:list': rpc<void, DirEntry[]>(),
  'plans:forBranch': rpc<{ cwd: string; branch: string }, PlanForBranch[]>(),
  'plans:scan': rpc<{ paths: string[] }, PlanScanEntry[]>(),
  'plans:changed': evt<{ plansDir: string }>(),

  // ── db / dbq ──
  'db:connect': rpc<{ config: DbConfig }, { ok: boolean; error?: string }>(),
  'db:objects': rpc<{ config: DbConfig }, DbObjects>(),
  'db:columns': rpc<{ config: DbConfig; table: string }, DbColumns>(),
  'db:query': rpc<{ config: DbConfig; sql: string }, DbResult>(),
  'db:disconnect': rpc<{ id: string }, boolean>(),
  'dbq:list': rpc<{ connId: string }, SavedQueryRef[]>(),
  'dbq:read': rpc<{ connId: string; name: string }, string>(),
  'dbq:write': rpc<{ connId: string; name: string; sql: string }, boolean>(),
  'dbq:delete': rpc<{ connId: string; name: string }, boolean>(),

  // ── docker ──
  'docker:available': rpc<void, DockerAvailable>(),
  'docker:containers': rpc<void, DockerRow[]>(),
  'docker:images': rpc<void, DockerRow[]>(),
  'docker:volumes': rpc<void, DockerRow[]>(),
  'docker:networks': rpc<void, DockerRow[]>(),
  'docker:compose': rpc<void, DockerRow[]>(),
  'docker:stats': rpc<void, DockerRow[]>(),
  'docker:inspect': rpc<{ kind: DockerKind; id: string }, string>(),
  'docker:logs': rpc<{ id: string; tail?: number }, string>(),
  'docker:action': rpc<
    { kind: DockerKind | 'compose'; action: string; id: string; configFile?: string },
    DockerActionResult
  >(),
  'docker:prune': rpc<{ target: string }, DockerPruneResult>(),

  // ── pr / gh ──
  'pr:available': rpc<{ cwd: string }, { ok: boolean; repo?: string; error?: string }>(),
  'pr:list': rpc<{ cwd: string }, { ok: boolean; error?: string; prs: PullRequest[] }>(),
  'pr:repos': rpc<
    { root: string },
    { ok: boolean; error?: string; repos: { name: string; path: string }[] }
  >(),
  'pr:list-all': rpc<
    { root: string; paths: string[] },
    { ok: boolean; error?: string; projects: ProjectPullRequests[] }
  >(),
  'pr:merge': rpc<
    { cwd: string; number: number; method: string },
    { ok: boolean; error?: string }
  >(),
  'pr:view': rpc<{ cwd: string; number: number }, string>(),
  'pr:diff': rpc<
    { cwd: string; number: number },
    { ok: boolean; patch?: string; error?: string }
  >(),
  'pr:comment': rpc<
    {
      cwd: string
      number: number
      path: string
      startLine: number
      endLine: number
      body: string
    },
    { ok: boolean; error?: string }
  >(),
  'gh:runs': rpc<{ cwd: string }, { ok: boolean; error?: string; runs: WorkflowRun[] }>(),
  'gh:run-jobs': rpc<{ cwd: string; id: number }, string>(),
  'gh:deployments': rpc<
    { cwd: string },
    { ok: boolean; error?: string; deployments: DeploymentStatus[] }
  >(),
  'gh:deploys-all': rpc<
    { root: string; paths: string[] },
    { ok: boolean; error?: string; projects: ProjectDeployments[] }
  >(),

  // ── secrets ──
  'secrets:available': rpc<void, boolean>(),
  'secrets:get': rpc<{ entryId: string; key: string }, string | null>(),
  'secrets:set': rpc<{ entryId: string; key: string; value: string }, SecretsResult>(),
  'secrets:delete': rpc<{ entryId: string; key?: string }, SecretsResult>(),

  // ── ios ──
  'iosWorktree:scriptPath': rpc<void, string>(),
  'iosWorktree:report': rpc<
    { repoRoot: string; cfg?: SavedIosConfig },
    IosWorktreeReport | null
  >(),
  'iosWorktree:stop': rpc<{ worktreePath: string; cfg?: SavedIosConfig }, boolean>(),
  'ios:listTargets': rpc<void, IosTargets>(),
  'ios:listSchemes': rpc<{ repoRoot: string; cfg?: SavedIosConfig }, string[]>(),

  // ── app / deploy / monaco / zsh / todo / backlog / sound / improve-window ──
  'app:version': rpc<void, string>(),
  'app:buildInfo': rpc<void, BuildInfo | null>(),
  'app:buildCounter': rpc<{ repoPath: string }, number | null>(),
  'app:repoGit': rpc<{ repoPath: string }, RepoGit | null>(),
  'deploy:build': rpc<{ repoPath: string; command: string }, DeployResult>(),
  'deploy:killAllPtys': rpc<void, boolean>(),
  'deploy:swap': rpc<{ repoPath: string }, boolean>(),
  'deploy:wasUpdating': rpc<void, boolean>(),
  'open-external': msg<{ url: string }>(),
  'notify': msg<{ title: string; body: string; paneId?: string }>(),
  'monaco:theme': rpc<{ name: string }, Record<string, unknown> | null>(),
  'zsh:commands': rpc<void, ZshCommand[]>(),
  'todo:read': rpc<{ path?: string }, string | null>(),
  'todo:write': rpc<{ path: string; content: string }, boolean>(),
  'backlog:read': rpc<void, BacklogFile | null>(),
  'sound:play': msg<{ name: string }>(),
  'sound:event': msg<{ event: 'question' | 'done' }>(),
  'app:quitting': evt<void>(),
  'window:fullscreen': evt<boolean>(),
  'improve-window:open': rpc<void, void>(),
  'improve-window:set-always-on-top': msg<{ value: boolean }>(),

  // ── store ──
  'store:load': rpc<void, SavedState | null>(),
  'store:save': msg<SavedState>()
} as const

export type Channels = typeof channels
export type ChannelName = keyof Channels

// Channel names narrowed by kind, so the wrappers accept only the right channels:
// handle/on take rpc/msg, emit takes evt.
type ChannelsOfKind<K> = {
  [C in ChannelName]: Channels[C] extends { kind: K } ? C : never
}[ChannelName]
export type RpcChannel = ChannelsOfKind<'rpc'>
export type MsgChannel = ChannelsOfKind<'msg'>
export type EvtChannel = ChannelsOfKind<'evt'>

export type ReqOf<C extends ChannelName> = Channels[C] extends { __req: infer R } ? R : never
export type ResOf<C extends ChannelName> = Channels[C] extends { __res: infer S } ? S : never
export type PayloadOf<C extends ChannelName> = Channels[C] extends { __payload: infer P }
  ? P
  : never

// Helper used by the typed wrappers: channels whose Req is `void` take no payload
// argument; everything else takes exactly one.
export type ReqArgs<C extends ChannelName> = ReqOf<C> extends void ? [] : [req: ReqOf<C>]
export type PayloadArgs<C extends ChannelName> = PayloadOf<C> extends void
  ? []
  : [payload: PayloadOf<C>]
