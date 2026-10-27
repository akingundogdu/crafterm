// Icon for the pane header's pop-out button (shown on side-by-side tiles). A box
// with an arrow leaving its top-right corner — the "detach into its own window"
// affordance. Injected via innerHTML in onAfterRender: the gea runtime does not
// honour inline <svg> JSX or an innerHTML prop (same pattern as status-copy-btn).
export const POPOUT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7.5"/><path d="M10 2.5h3.5V6"/><path d="M13.5 2.5 8 8"/></svg>'
