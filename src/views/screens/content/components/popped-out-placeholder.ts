import { el } from '@views/lib/dom'

export interface PoppedOutPlaceholderProps {
  title: string
  onFocusClick: (e: MouseEvent) => void
}

// A pane shown in a separate pop-out window leaves this placeholder behind.
export function buildPoppedOutPlaceholder(props: PoppedOutPlaceholderProps): HTMLElement {
  return el(
    'div',
    { class: 'pane-box pane-popped' },
    el(
      'div',
      { class: 'pane-popped-inner' },
      el('div', { class: 'pane-popped-label' }, props.title + ' is open in a separate window'),
      el('button', { class: 'settings-inline-btn', onClick: props.onFocusClick }, 'Focus window')
    )
  )
}
