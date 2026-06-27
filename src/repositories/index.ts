import type {
  Bookmark,
  AccountEntry,
  Reminder,
  TimeEntry,
  SshConnection,
  PaletteCommand,
  ActionMenuItem,
  MeetingNote,
  DailyPlanTask,
  DailyPlanTag
} from '@ui/types/types'
import { settings } from '@ui/state/state'
import { bookmarks } from '@ui/state/collections/bookmarks'
import { accounts } from '@ui/state/collections/accounts'
import { reminders } from '@ui/state/collections/reminders'
import { timeEntries } from '@ui/state/collections/time-entries'
import { meetingNotes } from '@ui/state/collections/meeting-notes'
import { dailyPlan } from '@ui/state/collections/daily-plan'
import { persistence } from './persistence.service'
import { createArrayRepository, validated } from './repository'
import { bookmarkSchema } from '@models/bookmark'
import { accountEntrySchema } from '@models/account'
import { reminderSchema } from '@models/reminder'
import { timeEntrySchema } from '@models/time-entry'
import { sshConnectionSchema } from '@models/ssh-connection'
import { paletteCommandSchema } from '@models/palette-command'
import { actionMenuItemSchema } from '@models/action-menu-item'
import { meetingNoteSchema } from '@models/meeting-note'
import { dailyTaskSchema } from '@models/daily-task'
import { dailyTagSchema } from '@models/daily-tag'

// JSON-backed repository instances — one per flat-array entity. Each reads its
// live `settings` array and persists via the debounced save, validating writes
// through the entity schema (non-destructively). Feature code accesses these
// entities ONLY through these repos, so the future SQLite backend (§10) is a
// drop-in swap. `prepend: true` mirrors the lists that keep newest-first order.

// Nested / non-flat entities get bespoke repositories (see each file).
export { notificationRepo } from './notification.repository'
export { applicationRepo } from './application.repository'
export { iosConfigRepo } from './ios-config.repository'
export { dbConnectionRepo } from './db-connection.repository'

const save = (): void => persistence.save()

export const bookmarkRepo = createArrayRepository<Bookmark>(() => bookmarks, save, {
  validate: validated(bookmarkSchema, 'bookmark'),
  prepend: true
})

export const accountRepo = createArrayRepository<AccountEntry>(() => accounts, save, {
  validate: validated(accountEntrySchema, 'account'),
  prepend: true
})

export const reminderRepo = createArrayRepository<Reminder>(() => reminders, save, {
  validate: validated(reminderSchema, 'reminder')
})

export const timeEntryRepo = createArrayRepository<TimeEntry>(() => timeEntries, save, {
  validate: validated(timeEntrySchema, 'time-entry')
})

export const sshConnectionRepo = createArrayRepository<SshConnection>(
  () => settings.sshConnections,
  save,
  { validate: validated(sshConnectionSchema, 'ssh-connection') }
)

export const paletteCommandRepo = createArrayRepository<PaletteCommand>(
  () => settings.paletteCommands,
  save,
  { validate: validated(paletteCommandSchema, 'palette-command') }
)

export const actionMenuRepo = createArrayRepository<ActionMenuItem>(
  () => settings.actionMenu,
  save,
  { validate: validated(actionMenuItemSchema, 'action-menu-item') }
)

export const meetingNoteRepo = createArrayRepository<MeetingNote>(
  () => meetingNotes,
  save,
  { validate: validated(meetingNoteSchema, 'meeting-note') }
)

export const dailyTaskRepo = createArrayRepository<DailyPlanTask>(
  () => dailyPlan.tasks,
  save,
  { validate: validated(dailyTaskSchema, 'daily-task') }
)

export const dailyTagRepo = createArrayRepository<DailyPlanTag>(
  () => dailyPlan.tags,
  save,
  { validate: validated(dailyTagSchema, 'daily-tag') }
)
