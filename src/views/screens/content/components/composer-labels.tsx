import { Component } from '@geajs/core'
import './composer-labels.css'
import store, {
  TAG_SVG,
  LABELS_EMPTY_HINT,
  labelsButtonText,
  labelsButtonTitle
} from './composer-labels.store'

// The composer context row's Labels dropdown, next to the Local/Worktree one: a
// multi-select over the Daily Plan tags that the filed ticket is created with. The
// same labels are reachable by typing "/<name>" in the prompt box, which toggles them
// through the shared selection in the composer store. The tag icon is injected through
// a ref (an `innerHTML=` JSX prop is dropped by gea).
export default class ComposerLabels extends Component {
  iconEl: HTMLSpanElement | null = null

  onAfterRender(): void {
    if (this.iconEl) this.iconEl.innerHTML = TAG_SVG
  }

  template() {
    const labels = store.labels
    const names = store.selectedNames
    return (
      <span class="composer-labels">
        <button
          class={'composer-labels-btn' + (names.length ? ' active' : '')}
          title={labelsButtonTitle(names)}
          onClick={() => store.toggleOpen()}
        >
          <span class="composer-labels-icon" ref={this.iconEl} />
          <span class="composer-labels-text">{labelsButtonText(names)}</span>
          <span class="composer-labels-caret">▾</span>
        </button>
        {store.isOpen ? (
          <div class="composer-labels-menu">
            {labels.length ? null : <div class="composer-labels-empty">{LABELS_EMPTY_HINT}</div>}
            {labels.map((tag) => (
              <button
                key={tag.id}
                class={'composer-labels-row' + (store.isOn(tag.id) ? ' active' : '')}
                onClick={() => store.toggleLabel(tag.id)}
              >
                <span class="composer-labels-swatch" style={{ backgroundColor: tag.color }} />
                <span class="composer-labels-name">{tag.name}</span>
                <span class="composer-labels-check">✓</span>
              </button>
            ))}
          </div>
        ) : null}
      </span>
    )
  }
}
