import { Component } from '@geajs/core'
import './composer-attachments.css'
import store, {
  REMOVE_GLYPH,
  attachmentTitle,
  onAttachmentsClick
} from './composer-attachments.store'

// The strip of pasted images under the prompt box: a thumbnail + filename chip per
// attachment, clicked to drop it again. The container stays mounted and hides itself
// through data-empty (which also subscribes this view to the list), so an empty
// composer looks exactly as it did before anything was pasted.
export default class ComposerAttachments extends Component {
  template() {
    const items = store.items
    return (
      <div
        class="composer-attachments"
        data-empty={String(items.length === 0)}
        onClick={onAttachmentsClick}
      >
        {items.map((item) => (
          <span
            key={item.id}
            class="composer-attachments-chip"
            data-attachment-id={item.id}
            title={attachmentTitle(item.name, item.path)}
          >
            <img class="composer-attachments-thumb" src={item.previewUrl} alt="" />
            <span class="composer-attachments-name">{item.name}</span>
            <span class="composer-attachments-remove">{REMOVE_GLYPH}</span>
          </span>
        ))}
      </div>
    )
  }
}
