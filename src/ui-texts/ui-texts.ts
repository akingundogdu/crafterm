// Centralized user-facing UI text (#9). Pure string constants (no imports of
// process-specific code) so both the renderer and the native app menu (main) can
// read from one place. Namespaced by UI region/screen; per-screen text lives in
// sibling <screen>.texts.ts files and is composed into `UITexts` here.
import { Settings } from './settings.texts'
import { Accounts } from './accounts.texts'
import { Bookmarks } from './bookmarks.texts'
import { Reminders } from './reminders.texts'
import { MeetingNotes } from './meeting-notes.texts'
import { Pickers } from './pickers.texts'
import { Spotlight } from './spotlight.texts'
import { Sidebar } from './sidebar.texts'
import { Notifications } from './notifications.texts'
import { DailyPlan } from './daily-plan.texts'
import { Pr } from './pr.texts'
import { Docker } from './docker.texts'
import { Database } from './database.texts'
import { Time } from './time.texts'
import { Menu } from './menu.texts'
import { DbPane } from './db-pane.texts'
import { DiffPane } from './diff-pane.texts'
import { CodePane } from './code-pane.texts'
import { Diff } from './diff.texts'
import { IosWorktree } from './ios-worktree.texts'
import { Components } from './components.texts'
import { Terminal } from './terminal.texts'
import { Resources } from './resources.texts'

export const UITexts = {
  Settings,
  Accounts,
  Bookmarks,
  Reminders,
  MeetingNotes,
  Pickers,
  Spotlight,
  Sidebar,
  Notifications,
  DailyPlan,
  Pr,
  Docker,
  Database,
  Time,
  Menu,
  DbPane,
  DiffPane,
  CodePane,
  Diff,
  IosWorktree,
  Components,
  Terminal,
  Resources
} as const
