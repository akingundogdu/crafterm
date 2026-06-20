// PR card types.

export interface PrCardActions {
  isCurrent: boolean
  onReview: () => void
  onDiff: () => void
  onMerge: () => void
}

// A resolved status badge: CSS class + label, with optional pulse + tooltip.
export interface BadgeSpec {
  cls: string
  text: string
  pulse?: boolean
  title?: string
}
