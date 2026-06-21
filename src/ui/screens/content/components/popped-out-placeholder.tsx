export interface PoppedOutPlaceholderProps {
  title: string
  onFocusClick: (e: MouseEvent) => void
}

// A pane shown in a separate pop-out window leaves this placeholder behind.
export function buildPoppedOutPlaceholder(props: PoppedOutPlaceholderProps): HTMLElement {
  return (
    <div class="pane-box pane-popped">
      <div class="pane-popped-inner">
        <div class="pane-popped-label">{props.title + ' is open in a separate window'}</div>
        <button class="settings-inline-btn" onClick={props.onFocusClick}>
          Focus window
        </button>
      </div>
    </div>
  ) as HTMLElement
}
