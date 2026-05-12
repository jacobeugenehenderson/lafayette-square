// Content-aware writes. Unconditional writeFileSync bumps mtime even when
// the new content is byte-identical to what's on disk — that's what makes
// the bake chain's incremental dirty-skip fail. needsRebuild compares
// mtimes; if a "no-op" save touches the file, every downstream step
// thinks it's stale and reruns.
//
// writeIfChanged reads existing bytes, compares to incoming, and skips
// the write entirely on match. Returns true if it wrote, false if it
// skipped. Use as a drop-in for writeFileSync wherever the output is an
// input to a later bake step (or to needsRebuild generally).
import { readFileSync, writeFileSync, existsSync } from 'fs'

export function writeIfChanged(path, content) {
  const incoming = Buffer.isBuffer(content) ? content : Buffer.from(content)
  if (existsSync(path)) {
    try {
      const existing = readFileSync(path)
      if (existing.equals(incoming)) return false
    } catch {
      // unreadable existing file — fall through to write
    }
  }
  writeFileSync(path, incoming)
  return true
}
