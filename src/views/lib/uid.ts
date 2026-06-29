// Self-contained (§2.7) id generator for the gea tree, mirroring the legacy
// @ui/state/state `uid`. `seq` alone restarts at 0 each session while ids
// persist, so a fresh session would regenerate `bm1`, `tag1`, … and collide with
// saved entities; prefixing the per-session time keeps ids unique across
// sessions, and `++seq` keeps them unique within one.
let seq = 0

export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${(++seq).toString(36)}`
}
