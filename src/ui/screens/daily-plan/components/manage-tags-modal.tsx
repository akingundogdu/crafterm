import { ManageTagsModalController } from './manage-tags-modal.controller'

export interface ManageTagsModalProps {
  // Re-render the board when the modal closes (tag edits affect cards).
  rerender: () => void
  // The active tag-filter set, owned by the board; a deleted tag is dropped from
  // it so the board isn't stranded on an empty filter.
  tagFilter: Set<string>
}

// Modal to edit tag colors/names and delete tags. Deletes cascade to every task
// carrying the tag.
export function showManageTagsModal(props: ManageTagsModalProps): void {
  new ManageTagsModalController(props).open()
}
