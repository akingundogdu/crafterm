// Single source of truth for the entire IPC surface. PURE: no electron, no DOM —
// safe to import from both the main and renderer bundles. The process-specific
// typed wrappers live in channels.main.ts (handle/on/emit) and channels.client.ts
// (call/send/listen); both derive their param + return types from this registry,
// so a channel typo or a main↔client type drift fails at compile time.
//
// Channel-string format stays Electron-conventional ('<domain>:<verb>'), but the
// literal lives in ONE place — the `Channel` namespace below. Call sites reference
// `Channel.Domain.Verb` (never a raw string); the registry is keyed by the same
// const, so the wire string is declared exactly once. The req/res type definitions
// are imported from each domain's *.types.ts — central wiring, dispersed types.
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

// ---- The channel names, grouped by domain ----
// The ONLY place a wire string ('<domain>:<verb>') is written. Call sites use
// `Channel.Domain.Verb`; the registry below is keyed by these same values.
export const Channel = {
  Pty: {
    Create: 'pty:create',
    Input: 'pty:input',
    Resize: 'pty:resize',
    Kill: 'pty:kill',
    Adopt: 'pty:adopt',
    Data: 'pty:data',
    Exit: 'pty:exit'
  },
  Pane: {
    Info: 'pane:info',
    Focus: 'focus-pane'
  },
  Menu: {
    ClosePane: 'menu:close-pane'
  },
  Popout: {
    Open: 'popout:open',
    CloseConfirmed: 'popout:close-confirmed',
    Focus: 'popout:focus',
    Killed: 'popout:killed',
    ConfirmClose: 'popout:confirm-close'
  },
  Proc: {
    Start: 'proc:start',
    Buffer: 'proc:buffer',
    Attach: 'proc:attach',
    Exit: 'proc:exit'
  },
  Git: {
    Branches: 'git:branches',
    StashList: 'git:stashList',
    FileStatus: 'git:fileStatus',
    Worktrees: 'git:worktrees',
    WorktreeAdd: 'git:worktreeAdd'
  },
  Dir: {
    List: 'dir:list'
  },
  Fs: {
    ListEntries: 'fs:listEntries',
    FindFiles: 'fs:findFiles',
    ResolveFile: 'fs:resolveFile',
    ReadMd: 'fs:readMd',
    ReadText: 'fs:readText',
    WriteMd: 'fs:writeMd',
    WriteText: 'fs:writeText',
    CreateFile: 'fs:createFile',
    Mkdir: 'fs:mkdir',
    Rename: 'fs:rename',
    Trash: 'fs:trash',
    ResolveImport: 'fs:resolveImport'
  },
  Ide: {
    Open: 'ide:open'
  },
  Shell: {
    OpenPath: 'shell:openPath',
    RevealPath: 'shell:revealPath'
  },
  Markdown: {
    Open: 'markdown:open',
    FindAll: 'markdown:findAll'
  },
  Claude: {
    LatestSession: 'claude:latestSession',
    SessionCwd: 'claude:sessionCwd',
    Sessions: 'claude:sessions',
    SessionTitle: 'claude:sessionTitle',
    SessionStatus: 'claude:sessionStatus',
    PermissionMode: 'claude:permissionMode',
    WatchSessions: 'claude:watchSessions',
    SessionsChanged: 'claude:sessionsChanged',
    UsageSummary: 'claude:usageSummary',
    RealUsage: 'claude:realUsage'
  },
  Notebook: {
    Tree: 'notebook:tree',
    Read: 'notebook:read',
    Write: 'notebook:write',
    Mkdir: 'notebook:mkdir',
    Create: 'notebook:create',
    Rename: 'notebook:rename',
    Move: 'notebook:move',
    Delete: 'notebook:delete',
    Reveal: 'notebook:reveal'
  },
  Plans: {
    List: 'plans:list',
    ForBranch: 'plans:forBranch',
    Scan: 'plans:scan',
    Changed: 'plans:changed'
  },
  Db: {
    Connect: 'db:connect',
    Objects: 'db:objects',
    Columns: 'db:columns',
    Query: 'db:query',
    Disconnect: 'db:disconnect'
  },
  Dbq: {
    List: 'dbq:list',
    Read: 'dbq:read',
    Write: 'dbq:write',
    Delete: 'dbq:delete'
  },
  Docker: {
    Available: 'docker:available',
    Containers: 'docker:containers',
    Images: 'docker:images',
    Volumes: 'docker:volumes',
    Networks: 'docker:networks',
    Compose: 'docker:compose',
    Stats: 'docker:stats',
    Inspect: 'docker:inspect',
    Logs: 'docker:logs',
    Action: 'docker:action',
    Prune: 'docker:prune'
  },
  Pr: {
    Available: 'pr:available',
    List: 'pr:list',
    Repos: 'pr:repos',
    ListAll: 'pr:list-all',
    Merge: 'pr:merge',
    View: 'pr:view',
    Diff: 'pr:diff',
    Comment: 'pr:comment'
  },
  Gh: {
    Runs: 'gh:runs',
    RunJobs: 'gh:run-jobs',
    Deployments: 'gh:deployments',
    DeploysAll: 'gh:deploys-all'
  },
  Secrets: {
    Available: 'secrets:available',
    Get: 'secrets:get',
    Set: 'secrets:set',
    Delete: 'secrets:delete'
  },
  IosWorktree: {
    ScriptPath: 'iosWorktree:scriptPath',
    Report: 'iosWorktree:report',
    Stop: 'iosWorktree:stop'
  },
  Ios: {
    ListTargets: 'ios:listTargets',
    ListSchemes: 'ios:listSchemes'
  },
  App: {
    Version: 'app:version',
    BuildInfo: 'app:buildInfo',
    BuildCounter: 'app:buildCounter',
    RepoGit: 'app:repoGit',
    Quitting: 'app:quitting'
  },
  Deploy: {
    Build: 'deploy:build',
    KillAllPtys: 'deploy:killAllPtys',
    Swap: 'deploy:swap',
    WasUpdating: 'deploy:wasUpdating'
  },
  External: {
    Open: 'open-external'
  },
  Notify: {
    Show: 'notify'
  },
  Monaco: {
    Theme: 'monaco:theme'
  },
  Zsh: {
    Commands: 'zsh:commands'
  },
  Todo: {
    Read: 'todo:read',
    Write: 'todo:write'
  },
  Backlog: {
    Read: 'backlog:read'
  },
  Sound: {
    Play: 'sound:play',
    Event: 'sound:event'
  },
  Window: {
    Fullscreen: 'window:fullscreen'
  },
  ImproveWindow: {
    Open: 'improve-window:open',
    SetAlwaysOnTop: 'improve-window:set-always-on-top'
  },
  Store: {
    Load: 'store:load',
    Save: 'store:save'
  }
} as const

// ---- Channel-kind markers (phantom-typed; carry no runtime payload) ----
// rpc = request/response (invoke ↔ handle). msg = renderer→main one-way (send ↔ on).
// evt = main→renderer push (webContents.send ↔ on).
export const rpc = <Req, Res>(): { kind: 'rpc'; __req: Req; __res: Res } => ({ kind: 'rpc' }) as never
export const msg = <Req>(): { kind: 'msg'; __req: Req } => ({ kind: 'msg' }) as never
export const evt = <Payload>(): { kind: 'evt'; __payload: Payload } => ({ kind: 'evt' }) as never

// The registry is keyed by the `Channel` const, so the wire string is declared
// once (above) and the types are wired here.
export const channels = {
  // ── terminal / pty ──
  [Channel.Pty.Create]: rpc<PtyCreateOptions, string>(),
  [Channel.Pty.Input]: msg<{ id: string; data: string }>(),
  [Channel.Pty.Resize]: msg<{ id: string; cols: number; rows: number }>(),
  [Channel.Pty.Kill]: msg<{ id: string }>(),
  [Channel.Pty.Adopt]: msg<{ id: string }>(),
  [Channel.Pty.Data]: evt<PtyDataEvent>(),
  [Channel.Pty.Exit]: evt<{ id: string }>(),
  [Channel.Pane.Info]: rpc<{ id: string; stableId?: string }, PaneInfo>(),
  [Channel.Menu.ClosePane]: evt<void>(),
  [Channel.Pane.Focus]: evt<{ id: string }>(),
  [Channel.Popout.Open]: rpc<{ paneId: string; title?: string }, void>(),
  [Channel.Popout.CloseConfirmed]: msg<{ id: string }>(),
  [Channel.Popout.Focus]: msg<{ id: string }>(),
  [Channel.Popout.Killed]: evt<{ id: string }>(),
  [Channel.Popout.ConfirmClose]: evt<{ id: string }>(),
  [Channel.Proc.Start]: rpc<ProcStartOptions, string>(),
  [Channel.Proc.Buffer]: rpc<{ id: string }, string>(),
  [Channel.Proc.Attach]: msg<{ id: string }>(),
  [Channel.Proc.Exit]: evt<ProcExitEvent>(),

  // ── git ──
  [Channel.Git.Branches]: rpc<{ id: string }, string[]>(),
  [Channel.Git.StashList]: rpc<{ id: string }, GitStash[]>(),
  [Channel.Git.FileStatus]: rpc<{ cwd?: string }, GitFileStatus>(),
  [Channel.Git.Worktrees]: rpc<{ cwd?: string }, WorktreeListing>(),
  [Channel.Git.WorktreeAdd]: rpc<
    { repo: string; path: string; branch: string; base?: string },
    boolean
  >(),

  // ── fs (dir/md/fs/ide/shell/markdown) ──
  [Channel.Dir.List]: rpc<{ path?: string }, DirListing>(),
  [Channel.Fs.ListEntries]: rpc<{ path?: string }, FsEntryListing>(),
  [Channel.Markdown.FindAll]: rpc<{ root?: string }, MarkdownFiles>(),
  [Channel.Fs.FindFiles]: rpc<{ root?: string; exclude?: string[] }, MarkdownFiles>(),
  [Channel.Fs.ResolveFile]: rpc<{ base: string; rel: string }, string | null>(),
  [Channel.Fs.ReadMd]: rpc<{ path: string }, string>(),
  [Channel.Fs.ReadText]: rpc<{ path: string }, ReadTextResult>(),
  [Channel.Fs.WriteMd]: rpc<{ path: string; content: string }, boolean>(),
  [Channel.Fs.WriteText]: rpc<{ path: string; content: string }, boolean>(),
  [Channel.Fs.CreateFile]: rpc<{ path: string }, boolean>(),
  [Channel.Fs.Mkdir]: rpc<{ path: string }, boolean>(),
  [Channel.Fs.Rename]: rpc<{ from: string; to: string }, boolean>(),
  [Channel.Fs.Trash]: rpc<{ path: string }, boolean>(),
  [Channel.Fs.ResolveImport]: rpc<
    { fromFile: string; spec: string; symbol?: string },
    ImportResolution | null
  >(),
  [Channel.Ide.Open]: msg<{ path: string; ide: string }>(),
  [Channel.Shell.OpenPath]: msg<{ path: string }>(),
  [Channel.Shell.RevealPath]: msg<{ path: string }>(),
  [Channel.Markdown.Open]: msg<{ path: string }>(),

  // ── claude ──
  [Channel.Claude.LatestSession]: rpc<{ cwd?: string; since?: number }, string | null>(),
  [Channel.Claude.SessionCwd]: rpc<{ sessionId: string }, string | null>(),
  [Channel.Claude.Sessions]: rpc<void, ClaudeSession[]>(),
  [Channel.Claude.SessionTitle]: rpc<{ cwd: string; sessionId: string }, string | null>(),
  [Channel.Claude.SessionStatus]: rpc<
    { cwd: string; sessionId: string },
    ClaudeSessionStatus | null
  >(),
  [Channel.Claude.PermissionMode]: rpc<{ cwd: string; sessionId: string }, string | null>(),
  [Channel.Claude.WatchSessions]: rpc<{ cwd: string }, boolean>(),
  [Channel.Claude.SessionsChanged]: evt<{ cwd: string }>(),
  [Channel.Claude.UsageSummary]: rpc<void, ClaudeUsageSummary>(),
  [Channel.Claude.RealUsage]: rpc<ClaudeRealUsageOptions, ClaudeRealUsage>(),

  // ── notebook ──
  [Channel.Notebook.Tree]: rpc<void, NbNode[]>(),
  [Channel.Notebook.Read]: rpc<{ path: string }, string>(),
  [Channel.Notebook.Write]: msg<{ path: string; content: string }>(),
  [Channel.Notebook.Mkdir]: rpc<{ path: string }, boolean>(),
  [Channel.Notebook.Create]: rpc<{ path: string }, boolean>(),
  [Channel.Notebook.Rename]: rpc<{ path: string; name: string }, boolean>(),
  [Channel.Notebook.Move]: rpc<{ src: string; destDir: string }, boolean>(),
  [Channel.Notebook.Delete]: rpc<{ path: string }, boolean>(),
  [Channel.Notebook.Reveal]: msg<{ path: string }>(),

  // ── plans ──
  [Channel.Plans.List]: rpc<void, DirEntry[]>(),
  [Channel.Plans.ForBranch]: rpc<{ cwd: string; branch: string }, PlanForBranch[]>(),
  [Channel.Plans.Scan]: rpc<{ paths: string[] }, PlanScanEntry[]>(),
  [Channel.Plans.Changed]: evt<{ plansDir: string }>(),

  // ── db / dbq ──
  [Channel.Db.Connect]: rpc<{ config: DbConfig }, { ok: boolean; error?: string }>(),
  [Channel.Db.Objects]: rpc<{ config: DbConfig }, DbObjects>(),
  [Channel.Db.Columns]: rpc<{ config: DbConfig; table: string }, DbColumns>(),
  [Channel.Db.Query]: rpc<{ config: DbConfig; sql: string }, DbResult>(),
  [Channel.Db.Disconnect]: rpc<{ id: string }, boolean>(),
  [Channel.Dbq.List]: rpc<{ connId: string }, SavedQueryRef[]>(),
  [Channel.Dbq.Read]: rpc<{ connId: string; name: string }, string>(),
  [Channel.Dbq.Write]: rpc<{ connId: string; name: string; sql: string }, boolean>(),
  [Channel.Dbq.Delete]: rpc<{ connId: string; name: string }, boolean>(),

  // ── docker ──
  [Channel.Docker.Available]: rpc<void, DockerAvailable>(),
  [Channel.Docker.Containers]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Images]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Volumes]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Networks]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Compose]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Stats]: rpc<void, DockerRow[]>(),
  [Channel.Docker.Inspect]: rpc<{ kind: DockerKind; id: string }, string>(),
  [Channel.Docker.Logs]: rpc<{ id: string; tail?: number }, string>(),
  [Channel.Docker.Action]: rpc<
    { kind: DockerKind | 'compose'; action: string; id: string; configFile?: string },
    DockerActionResult
  >(),
  [Channel.Docker.Prune]: rpc<{ target: string }, DockerPruneResult>(),

  // ── pr / gh ──
  [Channel.Pr.Available]: rpc<{ cwd: string }, { ok: boolean; repo?: string; error?: string }>(),
  [Channel.Pr.List]: rpc<{ cwd: string }, { ok: boolean; error?: string; prs: PullRequest[] }>(),
  [Channel.Pr.Repos]: rpc<
    { root: string },
    { ok: boolean; error?: string; repos: { name: string; path: string }[] }
  >(),
  [Channel.Pr.ListAll]: rpc<
    { root: string; paths: string[] },
    { ok: boolean; error?: string; projects: ProjectPullRequests[] }
  >(),
  [Channel.Pr.Merge]: rpc<
    { cwd: string; number: number; method: string },
    { ok: boolean; error?: string }
  >(),
  [Channel.Pr.View]: rpc<{ cwd: string; number: number }, string>(),
  [Channel.Pr.Diff]: rpc<
    { cwd: string; number: number },
    { ok: boolean; patch?: string; error?: string }
  >(),
  [Channel.Pr.Comment]: rpc<
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
  [Channel.Gh.Runs]: rpc<{ cwd: string }, { ok: boolean; error?: string; runs: WorkflowRun[] }>(),
  [Channel.Gh.RunJobs]: rpc<{ cwd: string; id: number }, string>(),
  [Channel.Gh.Deployments]: rpc<
    { cwd: string },
    { ok: boolean; error?: string; deployments: DeploymentStatus[] }
  >(),
  [Channel.Gh.DeploysAll]: rpc<
    { root: string; paths: string[] },
    { ok: boolean; error?: string; projects: ProjectDeployments[] }
  >(),

  // ── secrets ──
  [Channel.Secrets.Available]: rpc<void, boolean>(),
  [Channel.Secrets.Get]: rpc<{ entryId: string; key: string }, string | null>(),
  [Channel.Secrets.Set]: rpc<{ entryId: string; key: string; value: string }, SecretsResult>(),
  [Channel.Secrets.Delete]: rpc<{ entryId: string; key?: string }, SecretsResult>(),

  // ── ios ──
  [Channel.IosWorktree.ScriptPath]: rpc<void, string>(),
  [Channel.IosWorktree.Report]: rpc<
    { repoRoot: string; cfg?: SavedIosConfig },
    IosWorktreeReport | null
  >(),
  [Channel.IosWorktree.Stop]: rpc<{ worktreePath: string; cfg?: SavedIosConfig }, boolean>(),
  [Channel.Ios.ListTargets]: rpc<void, IosTargets>(),
  [Channel.Ios.ListSchemes]: rpc<{ repoRoot: string; cfg?: SavedIosConfig }, string[]>(),

  // ── app / deploy / monaco / zsh / todo / backlog / sound / improve-window ──
  [Channel.App.Version]: rpc<void, string>(),
  [Channel.App.BuildInfo]: rpc<void, BuildInfo | null>(),
  [Channel.App.BuildCounter]: rpc<{ repoPath: string }, number | null>(),
  [Channel.App.RepoGit]: rpc<{ repoPath: string }, RepoGit | null>(),
  [Channel.Deploy.Build]: rpc<{ repoPath: string; command: string }, DeployResult>(),
  [Channel.Deploy.KillAllPtys]: rpc<void, boolean>(),
  [Channel.Deploy.Swap]: rpc<{ repoPath: string }, boolean>(),
  [Channel.Deploy.WasUpdating]: rpc<void, boolean>(),
  [Channel.External.Open]: msg<{ url: string }>(),
  [Channel.Notify.Show]: msg<{ title: string; body: string; paneId?: string }>(),
  [Channel.Monaco.Theme]: rpc<{ name: string }, Record<string, unknown> | null>(),
  [Channel.Zsh.Commands]: rpc<void, ZshCommand[]>(),
  [Channel.Todo.Read]: rpc<{ path?: string }, string | null>(),
  [Channel.Todo.Write]: rpc<{ path: string; content: string }, boolean>(),
  [Channel.Backlog.Read]: rpc<void, BacklogFile | null>(),
  [Channel.Sound.Play]: msg<{ name: string }>(),
  [Channel.Sound.Event]: msg<{ event: 'question' | 'done' }>(),
  [Channel.App.Quitting]: evt<void>(),
  [Channel.Window.Fullscreen]: evt<boolean>(),
  [Channel.ImproveWindow.Open]: rpc<void, void>(),
  [Channel.ImproveWindow.SetAlwaysOnTop]: msg<{ value: boolean }>(),

  // ── store ──
  [Channel.Store.Load]: rpc<void, SavedState | null>(),
  [Channel.Store.Save]: msg<SavedState>()
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
