// Walk the static+dynamic import graph from the Ward's kit entry (pinned Town.jsx), report who imports INSTANCE / instance.js.
import fs from 'node:fs'; import path from 'node:path'
const ROOT = process.argv[2]
const start = path.join(ROOT, 'src/components/Town.jsx')
const seen = new Set(); const edges = []
const exts = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']
function res(from, spec) { if (!spec.startsWith('.')) return null; const b = path.resolve(path.dirname(from), spec); for (const e of exts) { const p = b + e; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p } return null }
function walk(f) { if (seen.has(f)) return; seen.add(f); const s = fs.readFileSync(f, 'utf8'); const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g; let m; while ((m = re.exec(s))) { const spec = m[1]||m[2]||m[3]; const r = res(f, spec); if (r) { edges.push([f, r]); if (/\.(m?js|jsx)$/.test(r)) walk(r) } } }
walk(start)
const rel = p => path.relative(ROOT, p)
console.log('modules reached:', seen.size)
for (const [a, b] of edges) if (/src\/instance\.js$|instances\/registry\.js$|resolveLookId|placeBootTown/.test(b)) console.log(rel(a), '->', rel(b))
const tgt = [...seen].filter(f => /\/public\//.test(f)); console.log('public json reached:', tgt.map(rel))
for (const f of seen) { const s = fs.readFileSync(f,'utf8'); const hits = ['INSTANCE','looks/index.json','ward-look','resolveLookId','DEFAULT_LOOK','lafayette-square',"'lafayette"].filter(k=>s.includes(k)); if (hits.length) console.log('MENTIONS', rel(f), hits.join(',')) }
console.log('--- BASE_URL / fetch roots in reached modules')
for (const f of seen) { const s = fs.readFileSync(f,'utf8').split('\n'); s.forEach((l,i)=>{ if (/BASE_URL|['"`]\/(looks|textures|models|clouds|basis)\/|kitUrl\(|slabFetch\(|slabUrl\(|suspendSlabUrl\(|slabManifest\(|fetch\(/.test(l) && !/^\s*(\*|\/\/)/.test(l)) console.log(rel(f)+':'+(i+1), l.trim().slice(0,150)) }) }
