/**
 * _imports.mjs — the kit's source files and their static + dynamic LOCAL imports, for checks that ask what an entry
 * pulls in. One home (lifted from claims-the-town-reads-no-player-store.mjs, 2026-09-28). Relative specifiers only:
 * a bare package name is not the kit's file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

export function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}
/** Every source file under `dir` (default src/) as { path (repo-relative), src }. */
export const sourceFiles = (dir = join(ROOT, 'src')) => walk(dir).map((p) => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

const SPEC_RE = /(?:^\s*(?:import|export)\b[^;'"()]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\))/gm
export function specsOf(src) { return [...src.matchAll(SPEC_RE)].map((m) => m[1] || m[2] || m[3]) }
export function resolveSpec(byPath, fromPath, spec) {
  if (!spec.startsWith('.')) return null
  const base = relative(ROOT, resolve(ROOT, dirname(fromPath), spec.split('?')[0]))
  for (const e of EXTS) if (byPath.has(base + e)) return base + e
  return null
}
/** The import closure of `entry` over `files`; a file for which `stopAt(path)` is true is included but not walked through. */
export function closure(files, entry, stopAt = () => false) {
  const byPath = new Map(files.map((x) => [x.path, x]))
  const seen = new Set([entry]), q = [entry]
  while (q.length) {
    const p = q.shift(), x = byPath.get(p)
    if (!x || stopAt(p)) continue
    for (const s of specsOf(x.src)) { const r = resolveSpec(byPath, p, s); if (r && !seen.has(r)) { seen.add(r); q.push(r) } }
  }
  return [...seen].map((p) => byPath.get(p)).filter(Boolean)
}
