import { renderMarkdown } from '@views/markdown/markdown'
import { readDoc } from '../pane.state'

export interface DocReloadDeps {
  source: string
  absolute: boolean
  editor: HTMLTextAreaElement
  preview: HTMLDivElement
  // edit mode is owned by the lifecycle engine; re-render is skipped while
  // editing so unsaved edits aren't clobbered.
  isEditing: () => boolean
  // hands the freshly-read content back so the lifecycle engine can track `raw`.
  setRaw: (content: string) => void
}

// Re-read the file from disk and re-render. Used for initial load and the ⟳
// button. Skips the editor/preview update while editing to preserve unsaved
// edits, but always tracks the latest disk content as `raw`.
export function makeDocReload(deps: DocReloadDeps): () => Promise<void> {
  const { source, absolute, editor, preview, isEditing, setRaw } = deps
  return async (): Promise<void> => {
    const content = await readDoc(source, absolute)
    setRaw(content)
    if (!isEditing()) {
      editor.value = content
      preview.innerHTML = renderMarkdown(content)
    }
  }
}
