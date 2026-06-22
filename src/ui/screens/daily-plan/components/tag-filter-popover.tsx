import { TagFilterPopoverController } from './tag-filter-popover.controller'

export interface TagFilterPopoverProps {
  anchor: HTMLElement
  // The active tag-filter set, owned by the board; toggled in place here.
  tagFilter: Set<string>
  rerender: () => void
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
// Toggling a tag updates the caller-owned `tagFilter` set and re-renders the
// board live; the popover stays open (it lives on document.body, untouched by
// the header re-render).
export function openTagFilterPopover(props: TagFilterPopoverProps): void {
  new TagFilterPopoverController(props).open()
}
