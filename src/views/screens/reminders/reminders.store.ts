import { Store } from '@geajs/core'
import type { Reminder } from '@ui/types/types'
import { reminderRepo } from '@repositories'

// Reactive state for the gea Reminders panel. reminderRepo stays the persisted
// source of truth; this store mirrors it into a reactive array. The view derives
// the upcoming/past splits + sorting on plain copies (never sort in a getter).
class RemindersStore extends Store {
  items: Reminder[] = []

  reload(): void {
    this.items = [...reminderRepo.getAll()]
  }

  remove(id: string): void {
    reminderRepo.remove(id)
    this.reload()
  }
}

export default new RemindersStore()
