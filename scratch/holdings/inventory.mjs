// node inventory.mjs <mainRoot> <codeWorktree> > rows.json (run via scratch/holdings/regenerate.sh) — read-only. One row per file (numbered series collapsed).
import { readFileSync, statSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { join, relative, basename, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const [MAIN, CODE] = process.argv.slice(2)
const TOWNS = ['lafayette-square', 'hipointedemun', 'huron', 'provincetown', 'jacksonheights', 'altadena']
const ROOTS = [...TOWNS.flatMap(t => [[t, `cartograph/data/${t}`], [t, `public/baked/${t}`]]),
  ['(stray)', 'inventory'], ['(stray)', 'IGNORE'], ['(stray)', 'scratch/lafayette-square-research'], ['(stray)', 'scratch/huron-research'],
  ['(stray)', 'scratch/data-licences'], ['(stray)', '_handoffs'], ['(stray)', 'cartograph/data/lafayette-square-staging'], ['(stray)', 'src/data'], ['(stray)', 'assets']]
const walk = (d) => { let out = []; let es; try { es = readdirSync(d, { withFileTypes: true }) } catch { return out }
  for (const e of es) { if (e.name === '.DS_Store') continue; const p = join(d, e.name)
    let isDir = e.isDirectory(); if (e.isSymbolicLink()) { try { isDir = statSync(p).isDirectory() } catch { continue } }
    if (isDir) out = out.concat(walk(p)); else out.push(p) } return out }
const tracked = new Set(execFileSync('git', ['-C', MAIN, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n'))
// code readers: tracked code files in the integration worktree, minus data/docs
const codeFiles = execFileSync('git', ['-C', CODE, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n')
  .filter(f => /\.(m?js|jsx|ts|tsx|py|sh|cjs)$/.test(f) && !/^(scratch|cartograph\/_archive|public|node_modules|docs)\//.test(f))
const codeText = new Map(codeFiles.map(f => { try { return [f, readFileSync(join(CODE, f), 'utf8')] } catch { return [f, ''] } }))
const readersOf = (needle) => { const r = []; for (const [f, t] of codeText) { if (!t.includes(needle)) continue; const lines = t.split('\n').filter(l => l.includes(needle)); const w = lines.every(l => /write|mkdir|outPath|outFile|\bout\s*=|save|dest/i.test(l)); r.push(w ? f + ' (W)' : f) } return r.sort((a, b) => a.endsWith('(W)') - b.endsWith('(W)')) }
const sample = (p, size) => {
  const ext = extname(p).toLowerCase()
  try {
    if (ext === '.json' || ext === '.geojson') {
      if (size > 300e6) return { kind: 'json (too large to parse)' }
      const j = JSON.parse(readFileSync(p, 'utf8'))
      const meta = {}; for (const k of ['source', 'meta', 'generated', 'fetched', 'fetchedAt', 'acquired', 'date', '_comment', 'description', 'endpoint', 'url', 'license', 'licence', 'version', 'count'])
        if (j && !Array.isArray(j) && j[k] != null) meta[k] = typeof j[k] === 'object' ? JSON.stringify(j[k]).slice(0, 160) : String(j[k]).slice(0, 160)
      if (Array.isArray(j)) return { kind: `json array[${j.length}]`, keys: j[0] && typeof j[0] === 'object' ? Object.keys(j[0]).slice(0, 8) : [typeof j[0]], meta }
      const keys = Object.keys(j); const arr = keys.find(k => Array.isArray(j[k]))
      return { kind: `json {${keys.length} keys}${arr ? ` ${arr}[${j[arr].length}]` : ''}`, keys: keys.slice(0, 8), meta }
    }
    if (['.csv', '.txt', '.md', '.tsv', '.html', '.svg', '.xml', '.js', '.mjs'].includes(ext)) {
      const t = readFileSync(p, 'utf8'); const lines = t.split('\n')
      return { kind: `${ext.slice(1)} ${lines.length} lines`, head: lines.find(l => l.trim())?.slice(0, 160) }
    }
    const fd = openSync(p, 'r'), b = Buffer.alloc(8); readSync(fd, b, 0, 8, 0); closeSync(fd)
    return { kind: `${ext.slice(1) || 'binary'} (magic ${b.toString('hex').slice(0, 8)})` }
  } catch (e) { return { kind: `unreadable: ${String(e.message).slice(0, 60)}` } }
}
const rows = []
for (const [town, root] of ROOTS) {
  const files = walk(join(MAIN, root))
  const groups = new Map()
  for (const p of files) { const rel = relative(MAIN, p)
    // collapse numbered series and photo/tree dirs into one row
    const key = rel.replace(/^(public\/baked\/[^/]+)\/(trees|share)\/.*$/, '$1/$2/**').replace(/^(assets\/[^/]+)\/.*$/, '$1/**').replace(/\/(photos|logos|_cache|hero-impostor|tiles|impostor[^/]*)\/.*$/, '/$1/**').replace(/\d{3,}/g, 'N')
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(rel) }
  for (const [key, rels] of groups) {
    const first = rels[0], st = statSync(join(MAIN, first))
    let bytes = 0, newest = 0; for (const r of rels) { try { const s = statSync(join(MAIN, r)); bytes += s.size; newest = Math.max(newest, s.mtimeMs) } catch {} }
    const bn = basename(first), series = rels.length > 1
    const needle = series ? (key.match(/\/([^/*]+)\/\*\*$/)?.[1] ? key.split('/').slice(-2, -1)[0] : bn.replace(/\d+/, '')) : bn
    const rd = readersOf(series && key.endsWith('/**') ? `'${key.split('/').slice(-2, -1)[0]}'` : bn)
    const rd2 = rd.length ? rd : (series && key.endsWith('/**') ? readersOf(key.split('/').slice(-2, -1)[0]) : [])
    rows.push({ town, root, path: key, n: rels.length, bytes, mtime: new Date(newest).toISOString().slice(0, 10),
      tracked: rels.filter(r => tracked.has(r)).length, symlink: (() => { try { return readdirSync(join(MAIN, root)) && false } catch { return false } })(),
      sample: series ? { kind: `${rels.length} files` , head: rels.slice(0, 2).join(', ') } : sample(join(MAIN, first), st.size),
      sha: rels.length === 1 && st.size < 400e6 ? createHash('sha1').update(readFileSync(join(MAIN, first))).digest('hex').slice(0, 12) : null,
      readers: rd2.slice(0, 4), readOnly: rd2.filter(x => !x.endsWith('(W)')).length, readerCount: rd2.length, basename: bn })
  }
}
console.log(JSON.stringify(rows))
