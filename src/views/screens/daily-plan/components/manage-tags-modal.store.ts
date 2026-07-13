import { Store } from '@geajs/core'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import type { DailyPlanTag } from '@views/types/types'

// Reactive state + logic for the gea Manage-tags modal. Holds the tag list as a
// reactive snapshot so a delete re-renders the keyed row list; color/name edits
// upsert without a reload (the legacy imperative controller only re-rendered on
// delete). Singleton reset on each open (mirrors reminder-form.store). Deletes
// cascade to every task carrying the tag and drop it from the board's active
// filter so the board isn't stranded empty. Self-contained — no @ui (§2.7).
class ManageTagsStore extends Store {
  // Plain snapshots of the repo tags — reassigned on delete to drive re-render.
  tags: DailyPlanTag[] = []

  // The active tag-filter set, owned by the board; a deleted tag is dropped from it
  // so the board isn't stranded on an empty filter.
  private tagFilter: Set<string> = new Set()

  open(tagFilter: Set<string>): void {
    this.tagFilter = tagFilter
    this.reload()
  }

  private reload(): void {
    this.tags = dailyTagRepo.getAll().map((t) => ({ ...t }))
  }

  // Persist a color edit. Builds a fresh object via spread so a reactive proxy is
  // only READ, never handed to the repo (§5.3). No reload — matches the legacy
  // onChange which never re-rendered the list.
  setColor(tag: DailyPlanTag, color: string): void {
    dailyTagRepo.upsert({ ...tag, color })
  }

  // Persist a rename (caller guards against an empty value). Fresh object per §5.3.
  setName(tag: DailyPlanTag, name: string): void {
    dailyTagRepo.upsert({ ...tag, name })
  }

  // Delete a tag: remove its record, strip it from every task, drop it from the
  // active filter, then reload to re-render the list.
  deleteTag(tag: DailyPlanTag): void {
    dailyTaskRepo.remove(tag.id)
    for (const t of dailyTaskRepo.getAll()) {
      if (!t.tagIds.includes(tag.id)) continue
      dailyTaskRepo.upsert({ ...t, tagIds: t.tagIds.filter((id) => id !== tag.id) })
    }
    this.tagFilter.delete(tag.id) // drop from the active filter so the board isn't stranded empty
    this.reload()
  }
}

export default new ManageTagsStore()
