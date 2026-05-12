// Content-aware writes. Two jobs:
//
//   1. Don't rewrite a file with byte-identical content (avoids the disk
//      I/O of pretty-printing the same JSON a thousand times during an
//      authoring session).
//
//   2. Still bump the output's mtime to "now" on every successful call,
//      whether or not we actually wrote. This is the canonical `make`
//      behavior — a successful build verifies the output is up-to-date
//      *as of now*, so the next dirty-check sees the chain as stable.
//      Without (2), editing a source script permanently invalidates its
//      downstream output: pipeline.js > map.json forever, because the
//      no-op write never bumps map.json's mtime. needsRebuild would then
//      rerun pipeline on every bake — exact failure the operator hit.
//
// Returns true if it wrote new content, false if it touched mtime only.
import { readFileSync, writeFileSync, existsSync, utimesSync } from 'fs'

export function writeIfChanged(path, content) {
  const incoming = Buffer.isBuffer(content) ? content : Buffer.from(content)
  if (existsSync(path)) {
    try {
      const existing = readFileSync(path)
      if (existing.equals(incoming)) {
        const now = new Date()
        utimesSync(path, now, now)
        return false
      }
    } catch {
      // unreadable existing file — fall through to write
    }
  }
  writeFileSync(path, incoming)
  return true
}
