// Markdown bridge types (markdown:* channels: open in the user's Markdown app +
// recursive .md finder). MarkdownFiles is shared with fs:findFiles, so it stays
// in fs.types; re-exported here for the markdown surface.
export type { MarkdownFiles } from '../fs/fs.types'

export interface MarkdownOpenRequest {
  path: string
}

export interface MarkdownFindAllRequest {
  root?: string
}
