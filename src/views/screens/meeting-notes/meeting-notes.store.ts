import { Store } from '@geajs/core'
import type { MeetingNote } from '@views/types/types'
import { meetingNoteRepo } from '@repositories'

// Reactive state for the gea Meeting Notes panel. meetingNoteRepo stays the
// persisted source of truth; this store mirrors it into a reactive array.
class MeetingNotesStore extends Store {
  items: MeetingNote[] = []
  archivedOpen = false

  reload(): void {
    this.items = [...meetingNoteRepo.getAll()]
  }

  toggleArchived(): void {
    this.archivedOpen = !this.archivedOpen
  }

  // Archive/unarchive operates on the RAW repo note (it mutates fields).
  archive(id: string): void {
    const note = meetingNoteRepo.get(id)
    if (!note) return
    note.archived = !note.archived
    note.updatedAt = Date.now()
    if (note.archived) this.archivedOpen = true
    meetingNoteRepo.upsert(note)
    this.reload()
  }

  remove(id: string): void {
    meetingNoteRepo.remove(id)
    this.reload()
  }
}

export default new MeetingNotesStore()
