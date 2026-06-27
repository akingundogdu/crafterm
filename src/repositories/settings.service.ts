import type {
  ActionMenuItem,
  DbNode,
  ProjectNode,
  SidebarNode,
  Project,
  AppNotification
} from '@ui/types/types'
import { BUILTIN_ACTIONS } from '@ui/types/types'
import type { SavedState } from '@repositories/state.types'
import { themes } from '@ui/themes/themes'
import {
  settings,
  state,
  commandHistory,
  notifications,
  NOTIF_PERSIST_WINDOW_MS,
  NOTIF_PERSIST_CAP,
  uid
} from '@ui/state/state'
import { setBookmarks } from '@models/bookmark'
import { setAccounts } from '@models/account'
import { setReminders } from '@models/reminder'
import { setTimeEntries } from '@models/time-entry'
import { setMeetingNotes } from '@models/meeting-note'
import { setDailyPlan } from '@models/daily-plan'
import { setDbTree } from '@models/db-tree'
import { persistence } from './persistence.service'
import { reminderSchema } from '@models/reminder'
import { bookmarkSchema } from '@models/bookmark'
import { accountEntrySchema } from '@models/account'
import { timeEntrySchema } from '@models/time-entry'
import { sshConnectionSchema } from '@models/ssh-connection'
import { paletteCommandSchema } from '@models/palette-command'
import { actionMenuItemSchema } from '@models/action-menu-item'
import { meetingNoteSchema } from '@models/meeting-note'
import { dailyTaskSchema } from '@models/daily-task'
import { dailyTagSchema } from '@models/daily-tag'
import { appNotificationSchema } from '@models/notification'

// Renderer load side of the persistence layer: validate/restore a SavedState
// blob into the live singletons, plus the one-time legacy migrations.

// Schema-validate persisted rows at the JSON boundary (Phase 2 / F). Each row is
// checked against its entity schema; malformed rows are dropped (and counted in
// one log line) rather than crashing the load or corrupting live state. Replaces
// the old ad-hoc `Array.isArray` + `as T[]` casts.
interface RowParser<T> {
  safeParse(row: unknown): { success: true; data: T } | { success: false; error: unknown }
}
function validateRows<T>(rows: unknown, schema: RowParser<T>, label: string): T[] {
  if (!Array.isArray(rows)) return []
  const out: T[] = []
  let dropped = 0
  for (const row of rows) {
    // Keep the ORIGINAL row on success (no key stripping), so a schema that
    // lags a new field can never silently drop persisted data — it only filters
    // genuinely malformed rows.
    if (schema.safeParse(row).success) out.push(row as T)
    else dropped++
  }
  if (dropped) console.warn(`[settings] dropped ${dropped} invalid ${label} row(s) on load`)
  return out
}

export function loadSettings(saved: SavedState): void {
  if (saved.font) settings.font = saved.font
  if (saved.sidebar) {
    settings.sidebar = {
      size: saved.sidebar.size ?? settings.sidebar.size,
      orientation: saved.sidebar.orientation ?? settings.sidebar.orientation,
      fontSize: saved.sidebar.fontSize ?? settings.sidebar.fontSize,
      collapsed: saved.sidebar.collapsed ?? settings.sidebar.collapsed,
      details: { ...settings.sidebar.details, ...(saved.sidebar.details ?? {}) },
      groupByRecency: saved.sidebar.groupByRecency ?? settings.sidebar.groupByRecency
    }
  }
  if (saved.customTheme) settings.customTheme = saved.customTheme
  if (saved.bgColor) settings.bgColor = saved.bgColor
  if (typeof saved.editorTheme === 'string') settings.editorTheme = saved.editorTheme
  if (typeof saved.docFontSize === 'number') settings.docFontSize = saved.docFontSize
  if (typeof saved.codeRoot === 'string') settings.codeRoot = saved.codeRoot
  if (typeof saved.defaultShell === 'string') settings.defaultShell = saved.defaultShell
  if (Array.isArray(saved.prProjects))
    settings.prProjects = saved.prProjects.filter((x): x is string => typeof x === 'string')
  if (Array.isArray(saved.codeExtensions)) settings.codeExtensions = saved.codeExtensions
  if (typeof saved.todoFile === 'string') settings.todoFile = saved.todoFile
  if (typeof saved.repoPath === 'string') settings.repoPath = saved.repoPath
  if (typeof saved.updateCommand === 'string' && saved.updateCommand.trim()) {
    settings.updateCommand = saved.updateCommand
  }
  if (saved.commands) {
    settings.commands = {
      ide: saved.commands.ide ?? settings.commands.ide,
      openMyZsh: saved.commands.openMyZsh ?? settings.commands.openMyZsh,
      mdFolders: Array.isArray(saved.commands.mdFolders)
        ? saved.commands.mdFolders
        : settings.commands.mdFolders
    }
  }
  if (Array.isArray(saved.environments) && saved.environments.length)
    settings.environments = saved.environments
  if (Array.isArray(saved.groups)) settings.groups = saved.groups.filter((s) => typeof s === 'string')
  if (Array.isArray(saved.actionMenu) && saved.actionMenu.length) {
    settings.actionMenu = validateRows(saved.actionMenu, actionMenuItemSchema, 'action-menu-item')
    // Auto-append any builtin actions added after this user's menu was seeded
    // (e.g. "Daily plan" shipped later). Items appear at the end of the menu;
    // persistence.save() persists the migration so it runs only once.
    let migrated = false
    const seenBuiltins = new Set(
      settings.actionMenu.filter((it) => it.kind === 'builtin').map((it) => it.builtinId)
    )
    for (const action of BUILTIN_ACTIONS) {
      if (seenBuiltins.has(action.id)) continue
      settings.actionMenu.push({
        id: uid('am'),
        title: action.label,
        kind: 'builtin',
        builtinId: action.id
      })
      migrated = true
    }
    if (migrated) persistence.save()
  } else {
    settings.actionMenu = seedActionMenu()
  }
  if (Array.isArray(saved.sshConnections))
    settings.sshConnections = validateRows(saved.sshConnections, sshConnectionSchema, 'ssh-connection')
  if (Array.isArray(saved.paletteCommands))
    settings.paletteCommands = validateRows(saved.paletteCommands, paletteCommandSchema, 'palette-command')
  if (typeof saved.notifPanelSize === 'number') settings.notifPanelSize = saved.notifPanelSize
  if (typeof saved.notifSound === 'string') settings.notifSound = saved.notifSound
  if (Array.isArray(saved.reminders))
    setReminders(validateRows(saved.reminders, reminderSchema, 'reminder'))
  if (saved.reminderDefaults && typeof saved.reminderDefaults === 'object') {
    const rd = saved.reminderDefaults
    const hour = Number(rd.defaultHour)
    settings.reminderDefaults = {
      defaultHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : settings.reminderDefaults.defaultHour,
      presets: Array.isArray(rd.presets) && rd.presets.length
        ? rd.presets
            .filter((p) => p && typeof p.label === 'string')
            .map((p) => ({
              label: p.label,
              offsetMin: typeof p.offsetMin === 'number' ? p.offsetMin : undefined,
              days: typeof p.days === 'number' ? p.days : undefined,
              snapHour: p.snapHour === true ? true : undefined
            }))
        : settings.reminderDefaults.presets
    }
  }
  if (Array.isArray(saved.bookmarks))
    setBookmarks(validateRows(saved.bookmarks, bookmarkSchema, 'bookmark'))
  if (Array.isArray(saved.accounts))
    setAccounts(validateRows(saved.accounts, accountEntrySchema, 'account'))
  if (saved.claudePlanCaps && typeof saved.claudePlanCaps === 'object') {
    settings.claudePlanCaps = {
      daily: Number(saved.claudePlanCaps.daily) || settings.claudePlanCaps.daily,
      weekly: Number(saved.claudePlanCaps.weekly) || settings.claudePlanCaps.weekly,
      monthly: Number(saved.claudePlanCaps.monthly) || settings.claudePlanCaps.monthly,
      effort:
        (saved.claudePlanCaps.effort as 'low' | 'medium' | 'high') ?? settings.claudePlanCaps.effort
    }
  }
  if (saved.claudeUsageAuth && typeof saved.claudeUsageAuth === 'object') {
    settings.claudeUsageAuth = {
      keychainService:
        typeof saved.claudeUsageAuth.keychainService === 'string'
          ? saved.claudeUsageAuth.keychainService
          : settings.claudeUsageAuth.keychainService,
      fallbackSecretId:
        typeof saved.claudeUsageAuth.fallbackSecretId === 'string'
          ? saved.claudeUsageAuth.fallbackSecretId
          : '',
      fallbackSecretKey:
        typeof saved.claudeUsageAuth.fallbackSecretKey === 'string'
          ? saved.claudeUsageAuth.fallbackSecretKey
          : ''
    }
  }
  if (saved.claudeUsageNotify && typeof saved.claudeUsageNotify === 'object') {
    const cn = saved.claudeUsageNotify
    const win = (
      v: unknown,
      fb: { resetsAt: number; level: number }
    ): { resetsAt: number; level: number } => {
      if (!v || typeof v !== 'object') return fb
      const o = v as Record<string, unknown>
      return { resetsAt: Number(o.resetsAt) || 0, level: Number(o.level) || 0 }
    }
    settings.claudeUsageNotify = {
      session: win(cn.session, settings.claudeUsageNotify.session),
      week: win(cn.week, settings.claudeUsageNotify.week)
    }
  }
  if (typeof saved.explorerRoot === 'string') settings.explorerRoot = saved.explorerRoot
  if (Array.isArray(saved.explorerExclude)) settings.explorerExclude = saved.explorerExclude
  if (Array.isArray(saved.linkedFiles)) settings.linkedFiles = saved.linkedFiles
  if (saved.notebookColors && typeof saved.notebookColors === 'object')
    settings.notebookColors = saved.notebookColors
  if (Array.isArray(saved.dbTree)) setDbTree(saved.dbTree as DbNode[])
  if (Array.isArray(saved.timeEntries))
    setTimeEntries(validateRows(saved.timeEntries, timeEntrySchema, 'time-entry'))
  if (saved.dailyPlan && typeof saved.dailyPlan === 'object') {
    const dp = saved.dailyPlan
    setDailyPlan({
      tasks: validateRows(dp.tasks, dailyTaskSchema, 'daily-task'),
      tags: validateRows(dp.tags, dailyTagSchema, 'daily-tag')
    })
  }
  if (Array.isArray(saved.meetingNotes))
    setMeetingNotes(validateRows(saved.meetingNotes, meetingNoteSchema, 'meeting-note'))
  if (typeof saved.askProjectOnNew === 'boolean') settings.askProjectOnNew = saved.askProjectOnNew
  if (saved.tabDisplay && typeof saved.tabDisplay === 'object') {
    const td = saved.tabDisplay
    const mode = td.mode === 'text' || td.mode === 'both' ? td.mode : 'icon'
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
    settings.tabDisplay = {
      mode,
      hidden: {
        left: strArr(td.hidden?.left),
        right: strArr(td.hidden?.right)
      },
      order: {
        left: strArr(td.order?.left),
        right: strArr(td.order?.right)
      }
    }
  }
  if (saved.bindings) settings.bindings = saved.bindings
  if (Array.isArray(saved.commandHistory)) commandHistory.push(...saved.commandHistory)
  if (saved.theme && (themes[saved.theme] || saved.theme === 'Custom')) settings.themeName = saved.theme
  if (Array.isArray(saved.notifications)) {
    const cutoff = Date.now() - NOTIF_PERSIST_WINDOW_MS
    for (const n of saved.notifications) {
      if (typeof n?.time !== 'number' || n.time < cutoff) continue
      if (!appNotificationSchema.safeParse(n).success) continue // drop malformed
      notifications.push(n as AppNotification)
      if (notifications.length >= NOTIF_PERSIST_CAP) break
    }
  }
}

// Default action-menu rows: one builtin entry per registered action, in the
// historical order. Used on first run and when no saved menu exists.
export function seedActionMenu(): ActionMenuItem[] {
  return BUILTIN_ACTIONS.map((a) => ({
    id: uid('am'),
    title: a.label,
    kind: 'builtin' as const,
    builtinId: a.id
  }))
}

// One-time migration of pre-unified-tree state. settings.projects and
// settings.features no longer exist at runtime; older state files still have
// them, so we fold those entries into state.tree once after restore. The next
// persist() drops the legacy fields from the JSON.
export function migrateLegacyState(saved: SavedState): void {
  if (Array.isArray(saved.projects) && saved.projects.length) {
    mergeLegacyProjects(state.tree, saved.projects)
  }
  if (Array.isArray(saved.features) && saved.features.length) {
    for (const f of saved.features) {
      const owner = findProjectByPathInTree(state.tree, f.projectPath)
      if (!owner) continue
      owner.features = owner.features ?? []
      if (!owner.features.find((x) => x.id === f.id)) {
        owner.features.push({ id: f.id, name: f.name })
      }
    }
  }
}

// Merge a legacy catalog (Project[]) into the live sidebar tree at the given
// level. Path-based dedup: an existing ProjectNode at the same path gets the
// catalog's missing fields filled in (apps, startup, env, shell, command, group)
// and its sub-projects merged recursively. Catalog projects with no match are
// pushed as new ProjectNodes.
function mergeLegacyProjects(list: SidebarNode[], catalog: Project[]): void {
  for (const c of catalog) {
    let node = list.find((n): n is ProjectNode => n.kind === 'project' && n.path === c.path)
    if (!node) {
      node = {
        kind: 'project',
        id: uid('p'),
        name: c.name,
        color: null,
        collapsed: false,
        pinned: false,
        children: [],
        path: c.path
      }
      list.push(node)
    }
    if (c.command && !node.command) node.command = c.command
    if (c.group && !node.group) node.group = c.group
    if (c.startup && !node.startup) node.startup = c.startup
    if (c.env && !node.env) node.env = c.env
    if (c.shell && !node.shell) node.shell = c.shell
    if (c.apps && c.apps.length) {
      const existing = node.apps ?? []
      const byId = new Set(existing.map((a) => a.id))
      for (const a of c.apps) if (!byId.has(a.id)) existing.push(a)
      node.apps = existing
    }
    if (c.children && c.children.length) mergeLegacyProjects(node.children, c.children)
  }
}

function findProjectByPathInTree(nodes: SidebarNode[], path: string): ProjectNode | null {
  for (const n of nodes) {
    if (n.kind === 'project' && n.path === path) return n
    if (n.kind === 'project' || n.kind === 'folder') {
      const r = findProjectByPathInTree(n.children, path)
      if (r) return r
    }
  }
  return null
}
