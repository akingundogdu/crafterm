// A pending field-edit row. Tracks the raw (possibly secret) value separately
// from the draft so secret plaintext never round-trips through the draft/JSON.
export interface PendingField {
  key: string
  rawValue: string
  secret: boolean
  existed: boolean
}
