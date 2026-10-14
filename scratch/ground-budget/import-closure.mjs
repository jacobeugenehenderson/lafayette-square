// The import closure of a module at a git commit, and which of its files differ from HEAD (Brace, 2026-10-13).
//   node scratch/ground-budget/import-closure.mjs <commit> <repo-relative entry>
import { execFileSync } from 'child_process'
import { posix } from 'path'
const [commit, entry] = process.argv.slice(2)
const show = (rev, p) => { try { return execFileSync('git', ['show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 }) } catch { return null } }
const blob = (rev, p) => { try { return execFileSync('git', ['rev-parse', `${rev}:${p}`], { encoding: 'utf8' }).trim() } catch { return null } }
const seen = new Set(), queue = [entry], missing = []
while (queue.length) { const p = queue.pop(); if (seen.has(p)) continue; seen.add(p)
  const src = show(commit, p); if (src == null) { missing.push(p); continue }
  for (const m of src.matchAll(/(?:import\s[^'"`]*?from\s*|import\s*\(\s*|export\s[^'"`]*?from\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const spec = m[1]; if (!spec.startsWith('.')) continue
    queue.push(posix.normalize(posix.join(posix.dirname(p), spec))) } }
const diff = [...seen].filter(p => !missing.includes(p) && blob(commit, p) !== blob('HEAD', p)).sort()
console.log(`closure of ${entry} at ${commit}: ${seen.size} files (${missing.length} not in the commit: ${missing.join(', ') || '—'})`)
console.log(`differ from HEAD (${diff.length}):\n  ${diff.join('\n  ')}`)
