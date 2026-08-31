// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const writePastedImage = vi.fn()

vi.mock('@services', () => ({ fsService: { writePastedImage: (...args: unknown[]) => writePastedImage(...args) } }))
let nextId = 0
vi.mock('@views/lib/uid', () => ({ uid: (prefix: string) => `${prefix}-${++nextId}` }))

const {
  default: store,
  extForMime,
  imageFilesFrom,
  toBase64,
  withAttachmentPaths,
  attachmentName,
  attachmentTitle,
  onComposerPaste,
  onAttachmentsClick,
  REMOVE_HINT
} = await import('@views/screens/content/components/composer-attachments.store')

// happy-dom has no File.arrayBuffer/object URLs; build the minimum the store reads.
function imageFile(name: string, type: string, bytes: number[]): File {
  return {
    name,
    type,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer)
  } as unknown as File
}

// A DataTransfer stand-in: `items` is what a screenshot paste populates, `files`
// what a Finder-copied image arrives as.
function clipboard(opts: { items?: File[]; files?: File[]; text?: string }): DataTransfer {
  const items = [
    ...(opts.items ?? []).map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    ...(opts.text ? [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] : [])
  ]
  return { items, files: opts.files ?? [] } as unknown as DataTransfer
}

describe('the composer image attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    nextId = 0
    writePastedImage.mockImplementation((_data, ext, name, batch) => `/tmp/${batch}/${name}.${ext}`)
  })

  it('maps the clipboard mime to a file extension, defaulting to png', () => {
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('IMAGE/WEBP')).toBe('webp')
    expect(extForMime('image/svg+xml')).toBe('svg')
    expect(extForMime('image/png; charset=binary')).toBe('png')
    expect(extForMime('application/octet-stream')).toBe('png')
  })

  it('reads the image files off a paste, from the items or the files fallback', () => {
    const png = imageFile('a.png', 'image/png', [1])
    expect(imageFilesFrom(clipboard({ items: [png], text: 'hello' }))).toEqual([png])
    expect(imageFilesFrom(clipboard({ files: [png] }))).toEqual([png])
    expect(imageFilesFrom(clipboard({ text: 'hello' }))).toEqual([])
    expect(imageFilesFrom(null)).toEqual([])
  })

  it('base64s the bytes in chunks, so a screenshot-sized buffer does not blow the stack', () => {
    expect(toBase64(new Uint8Array([104, 105]))).toBe(btoa('hi'))
    const big = new Uint8Array(200_000).fill(65)
    expect(() => toBase64(big)).not.toThrow()
    expect(atob(toBase64(big)).length).toBe(big.length)
  })

  it('writes a pasted image out under its image-N name and chips it', async () => {
    await store.add([imageFile('clip', 'image/jpeg', [1, 2, 3])])

    const [data, ext, name, batch] = writePastedImage.mock.calls[0]
    expect(data).toBe(toBase64(new Uint8Array([1, 2, 3])))
    expect(ext).toBe('jpg')
    expect(name).toBe('image-1')
    expect(batch).toBeTruthy()
    expect(store.items).toHaveLength(1)
    expect(store.items[0]).toMatchObject({ name: 'image-1', path: `/tmp/${batch}/image-1.jpg` })
    expect(store.isBusy).toBe(false)
  })

  it('numbers the images in paste order, across pastes, in one batch directory', async () => {
    await store.add([imageFile('a', 'image/png', [1]), imageFile('b', 'image/png', [2])])
    await store.add([imageFile('c', 'image/png', [3])])

    expect(store.items.map((item) => item.name)).toEqual(['image-1', 'image-2', 'image-3'])
    const batches = new Set(writePastedImage.mock.calls.map((call) => call[3]))
    expect(batches.size).toBe(1)
  })

  it('does not reuse the number of a removed image, so its file is never overwritten', async () => {
    await store.add([imageFile('a', 'image/png', [1]), imageFile('b', 'image/png', [2])])
    store.remove(store.items[1].id)

    await store.add([imageFile('c', 'image/png', [3])])

    expect(store.items.map((item) => item.name)).toEqual(['image-1', 'image-3'])
  })

  it('restarts at image-1 in a new batch once the ticket is filed', async () => {
    await store.add([imageFile('a', 'image/png', [1])])
    const firstBatch = writePastedImage.mock.calls[0][3]
    store.clear()

    await store.add([imageFile('b', 'image/png', [2])])

    expect(store.items.map((item) => item.name)).toEqual(['image-1'])
    // A new directory — the filed ticket's image-1 is still where its session left it.
    expect(writePastedImage.mock.calls[1][3]).not.toBe(firstBatch)
  })

  it('skips an image the main process refused to write, keeping the rest of the paste', async () => {
    writePastedImage.mockReturnValueOnce(null)

    await store.add([imageFile('a', 'image/png', [1]), imageFile('b', 'image/png', [2])])

    // The refused paste did not consume its number either.
    expect(store.items.map((item) => item.name)).toEqual(['image-1'])
  })

  it('ignores an empty file without going through IPC', async () => {
    await store.add([imageFile('empty', 'image/png', [])])

    expect(writePastedImage).not.toHaveBeenCalled()
    expect(store.items).toEqual([])
  })

  it('attaches an image paste and lets a text paste through', async () => {
    const png = imageFile('a.png', 'image/png', [1])
    const imagePaste = { clipboardData: clipboard({ items: [png] }), preventDefault: vi.fn() }
    const textPaste = { clipboardData: clipboard({ text: 'hello' }), preventDefault: vi.fn() }

    onComposerPaste(imagePaste as unknown as ClipboardEvent)
    onComposerPaste(textPaste as unknown as ClipboardEvent)
    await vi.waitFor(() => expect(store.items).toHaveLength(1))

    expect(imagePaste.preventDefault).toHaveBeenCalledTimes(1)
    expect(textPaste.preventDefault).not.toHaveBeenCalled()
  })

  it('removes the chip a click landed on, and clears them all on submit', async () => {
    await store.add([imageFile('a', 'image/png', [1]), imageFile('b', 'image/png', [2])])
    const [first] = store.items

    const chip = document.createElement('span')
    chip.setAttribute('data-attachment-id', first.id)
    const glyph = document.createElement('span')
    chip.appendChild(glyph)
    document.body.appendChild(chip)

    onAttachmentsClick({ target: glyph } as unknown as MouseEvent)
    expect(store.items.map((item) => item.name)).toEqual(['image-2'])

    onAttachmentsClick({ target: document.body } as unknown as MouseEvent)
    expect(store.items.map((item) => item.name)).toEqual(['image-2'])

    store.clear()
    expect(store.items).toEqual([])
    chip.remove()
  })

  it('appends an image-N line per attachment to the submitted prompt, and leaves a plain one alone', () => {
    expect(withAttachmentPaths('fix the header', [])).toBe('fix the header')
    expect(withAttachmentPaths('fix the header', [{ name: 'image-1', path: '/tmp/b/image-1.png' }])).toBe(
      'fix the header\n\nAttached image:\nimage-1: /tmp/b/image-1.png'
    )
    expect(
      withAttachmentPaths('the button in image-2 is off', [
        { name: 'image-1', path: '/tmp/b/image-1.png' },
        { name: 'image-2', path: '/tmp/b/image-2.png' }
      ])
    ).toBe(
      'the button in image-2 is off\n\nAttached images:\nimage-1: /tmp/b/image-1.png\nimage-2: /tmp/b/image-2.png'
    )
  })

  it('names an image by position and spells the name + path out in the tooltip', () => {
    expect(attachmentName(1)).toBe('image-1')
    expect(attachmentName(12)).toBe('image-12')
    expect(attachmentTitle('image-1', '/tmp/b/image-1.png')).toBe(
      `image-1\n/tmp/b/image-1.png\n${REMOVE_HINT}`
    )
  })

  it('hands the submit path fresh entries, not the store records themselves', async () => {
    await store.add([imageFile('a', 'image/png', [1])])

    expect(store.entries).toEqual([{ name: 'image-1', path: store.items[0].path }])
    expect(store.entries[0]).not.toBe(store.items[0])
  })
})
