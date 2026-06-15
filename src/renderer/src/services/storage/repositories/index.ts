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
} from '../../../types'
import { settings } from '../../../state'
import { persistence } from '../persistence.service'
import { createArrayRepository, validated } from './repository'
import { bookmarkSchema } from '../../domain/model/bookmark'
import { accountEntrySchema } from '../../domain/model/account'
import { reminderSchema } from '../../domain/model/reminder'
import { timeEntrySchema } from '../../domain/model/time-entry'
import { sshConnectionSchema } from '../../domain/model/ssh-connection'
import { paletteCommandSchema } from '../../domain/model/palette-command'
import { actionMenuItemSchema } from '../../domain/model/action-menu-item'
import { meetingNoteSchema } from '../../domain/model/meeting-note'
import { dailyTaskSchema } from '../../domain/model/daily-task'
import { dailyTagSchema } from '../../domain/model/daily-tag'

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

export const bookmarkRepo = createArrayRepository<Bookmark>(() => settings.bookmarks, save, {
  validate: validated(bookmarkSchema, 'bookmark'),
  prepend: true
})

export const accountRepo = createArrayRepository<AccountEntry>(() => settings.accounts, save, {
  validate: validated(accountEntrySchema, 'account'),
  prepend: true
})

export const reminderRepo = createArrayRepository<Reminder>(() => settings.reminders, save, {
  validate: validated(reminderSchema, 'reminder')
})

export const timeEntryRepo = createArrayRepository<TimeEntry>(() => settings.timeEntries, save, {
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
  () => settings.meetingNotes,
  save,
  { validate: validated(meetingNoteSchema, 'meeting-note') }
)

export const dailyTaskRepo = createArrayRepository<DailyPlanTask>(
  () => settings.dailyPlan.tasks,
  save,
  { validate: validated(dailyTaskSchema, 'daily-task') }
)

export const dailyTagRepo = createArrayRepository<DailyPlanTag>(
  () => settings.dailyPlan.tags,
  save,
  { validate: validated(dailyTagSchema, 'daily-tag') }
)
