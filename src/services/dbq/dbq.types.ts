// Saved-query bridge types (dbq:* channels: .sql files per connection).
export interface SavedQueryRef {
  name: string
  path: string
}

export interface DbqListRequest {
  connId: string
}

export interface DbqReadRequest {
  connId: string
  name: string
}

export interface DbqWriteRequest {
  connId: string
  name: string
  sql: string
}

export interface DbqDeleteRequest {
  connId: string
  name: string
}
