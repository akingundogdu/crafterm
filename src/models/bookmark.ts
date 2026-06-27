import { z } from 'zod'

// Bookmark — mirrors `Bookmark` in types.ts exactly (HR-1).

export const bookmarkSchema = z.object({
  id: z.string(),
  type: z.enum(['link', 'text', 'code', 'snippet']),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  language: z.string().optional(),
  createdAt: z.number()
})

export type Bookmark = z.infer<typeof bookmarkSchema>

export function makeBookmark(
  p: Partial<Bookmark> & Pick<Bookmark, 'type' | 'title' | 'content'>
): Bookmark {
  return bookmarkSchema.parse({ id: crypto.randomUUID(), tags: [], createdAt: Date.now(), ...p })
}

// Live collection (the user's current bookmarks). Persisted into the single
// crafterm-state.json; bookmarkRepo operates on this array (stable reference,
// mutated in place by setBookmarks).
export const bookmarks: Bookmark[] = []

export function setBookmarks(next: Bookmark[]): void {
  bookmarks.length = 0
  bookmarks.push(...next)
}
