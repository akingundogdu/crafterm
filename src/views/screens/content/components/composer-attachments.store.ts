import { Store } from '@geajs/core'
import { fsService } from '@services'
import { uid } from '@views/lib/uid'

// Non-view module for the composer's image attachments. An image pasted into the
// prompt box has nowhere to live — the clipboard bitmap is not a file — so it is
// written to a temp file through fs:writePastedImage and kept here as a chip under
// the box. On submit the composer appends `image-N: <path>` lines to the prompt,
// which is how Claude gets at the pictures: it reads the files off the paths.
//
// The images are named by position — image-1, image-2, … — and that name is the
// filename too, so the prompt can say "the button in image-2" and mean something
// Claude can resolve. Names restart at image-1 with every ticket, so each batch of
// attachments gets its own id: the main process files a batch into its own
// directory, and a still-running session's image-1 is never overwritten.
//
// The thumbnail is a blob URL over the pasted File (no second trip through IPC to
// read the bytes back); it is revoked as soon as the chip goes away.

export interface ComposerAttachment {
  id: string
  path: string
  name: string
  previewUrl: string
}

export const REMOVE_GLYPH = '×'
export const REMOVE_HINT = 'Click to remove'
export const ATTACHMENT_PROMPT_LABEL = 'Attached image'

// The name an attachment is referred to by, in the chip and in the prompt.
export function attachmentName(index: number): string {
  return `image-${index}`
}

// The chip's tooltip: the name to reference the image by, the absolute path that
// will be handed to Claude, and what a click does. Both are otherwise invisible
// until the prompt is submitted.
export function attachmentTitle(name: string, path: string): string {
  return `${name}\n${path}\n${REMOVE_HINT}`
}

// Clipboard mime → file extension. The map covers what a paste can realistically
// carry; anything unknown is written as a .png (macOS screenshots, the common case).
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/svg+xml': 'svg'
}

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase().split(';')[0].trim()] ?? 'png'
}

// The image files carried by a paste (or a drop). `items` is the reliable source —
// it is what a screenshot paste populates — with `files` as the fallback for a
// Finder-copied image file.
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)
  if (fromItems.length) return fromItems
  return Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
}

// Bytes → base64 for the IPC hop, in chunks: `String.fromCharCode(...bytes)` over a
// whole screenshot blows the argument limit and throws.
const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// The submitted prompt: what was typed, then one `image-N: <path>` line per
// attachment — the name first, so a prompt that talks about "image-2" lines up with
// the file. Unchanged when nothing is attached, so a plain prompt keeps its exact
// text (the ticket title/description derive from it).
export function withAttachmentPaths(text: string, items: { name: string; path: string }[]): string {
  if (!items.length) return text
  const lines = items.map((item) => `${item.name}: ${item.path}`).join('\n')
  const block = `${ATTACHMENT_PROMPT_LABEL}${items.length > 1 ? 's' : ''}:\n${lines}`
  return text ? `${text}\n\n${block}` : block
}

// happy-dom (unit tests) has no object URLs, and a revoke of a URL that was never
// created must not take the whole paste down with it.
function previewUrlFor(file: File): string {
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

function releasePreview(url: string): void {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Nothing to release — the blob URL was never handed out.
  }
}

async function writeImage(file: File, name: string, batch: string): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!bytes.length) return null
  return fsService.writePastedImage(toBase64(bytes), extForMime(file.type), name, batch)
}

// The batch the attachments on screen belong to, and the next free number in it.
// Both are non-reactive: the view renders the names off the items, not off these.
// A removed image does NOT free its number — image-3 would then land on the file
// image-3 already written for it.
let batchId = ''
let nextIndex = 1

class ComposerAttachmentsStore extends Store {
  // Reassigned, never mutated in place: gea only re-renders on a field write.
  items: ComposerAttachment[] = []
  isBusy = false

  // Fresh literals, never the store's own (proxied) records.
  get entries(): { name: string; path: string }[] {
    return this.items.map((item) => ({ name: item.name, path: item.path }))
  }

  // Write each image out under its image-N name and chip it. A file that fails to
  // write is skipped rather than aborting the rest of a multi-image paste.
  async add(files: File[]): Promise<void> {
    if (!files.length) return
    if (!batchId) batchId = uid('batch')
    this.isBusy = true
    try {
      const added: ComposerAttachment[] = []
      for (const file of files) {
        const name = attachmentName(nextIndex)
        const path = await writeImage(file, name, batchId)
        if (!path) continue
        nextIndex++
        added.push({ id: uid('attachment'), path, name, previewUrl: previewUrlFor(file) })
      }
      if (added.length) this.items = [...this.items, ...added]
    } finally {
      this.isBusy = false
    }
  }

  // The temp file itself is left behind on purpose: the prompt may already be running
  // in a Claude session, and the OS reaps the temp dir on its own schedule.
  remove(id: string): void {
    const gone = this.items.find((item) => item.id === id)
    if (!gone) return
    releasePreview(gone.previewUrl)
    this.items = this.items.filter((item) => item.id !== id)
  }

  // The filed ticket owns the batch it was submitted with; the next one starts a
  // new batch at image-1, in its own directory.
  clear(): void {
    batchId = ''
    nextIndex = 1
    if (!this.items.length) return
    this.items.forEach((item) => releasePreview(item.previewUrl))
    this.items = []
  }
}

const store = new ComposerAttachmentsStore()
export default store

// Paste in the prompt box: an image is swallowed and attached, anything else falls
// through to the textarea's own paste (text keeps pasting as text).
export function onComposerPaste(e: ClipboardEvent): void {
  const files = imageFilesFrom(e.clipboardData)
  if (!files.length) return
  e.preventDefault()
  void store.add(files)
}

// Removal is delegated from the list: a per-chip handler on a non-root child of a
// keyed `.map()` item is a gea crash, so the click is read back off the chip's
// data-attachment-id instead.
export function onAttachmentsClick(e: MouseEvent): void {
  const chip = (e.target as HTMLElement | null)?.closest?.('[data-attachment-id]')
  const id = chip?.getAttribute('data-attachment-id')
  if (id) store.remove(id)
}
