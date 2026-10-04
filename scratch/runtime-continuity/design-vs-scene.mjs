// READ-ONLY probe: design.json (per Look) vs scene.json (per Look slab).
// Parses DESIGN_FIELDS keys from the store source and bake-scene's `design.<key>` reads from its source.
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
const ROOT = new URL('../../', import.meta.url).pathname
const store = readFileSync(join(ROOT, 'src/cartograph/stores/useCartographStore.js'), 'utf8')
const a = store.indexOf('const DESIGN_FIELDS = ['), b = store.indexOf('\n]\n', a)
const block = store.slice(a, b)
const DF = [...block.matchAll(/(?:\{\s*key:\s*'(\w+)'|_grp\('(\w+)')/g)].map(m => m[1] || m[2])
const bs = readFileSync(join(ROOT, 'cartograph/bake-scene.js'), 'utf8')
const BS_READS = new Set([...bs.matchAll(/design\??\.(\w+)/g)].map(m => m[1]))
// migrateArchLight(design) reads archLight + arch internally
BS_READS.add('archLight')
// other bake modules' design reads (grep, not exhaustive): reported separately
const OTHER = {}
const files = ['cartograph/bake-ground.js','cartograph/bake-buildings.js','cartograph/forbidden-surface.mjs','arborist/bake-trees.js']
for (const f of files) for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/\bdesign\??\.(\w+)/g)) (OTHER[m[1]] ||= new Set()).add(f.split('/').pop())
// keys read via a named property in other modules
const extra = { lamps: 'bake-lamps.js', labels: 'bake-labels.js', terrainExag: 'terrainLoad.js', water: 'terrainReads.mjs', surfaces: 'surfaces.mjs/bake-ground', trees: 'bake-trees.js', groveThreshold: 'bake-trees.js' }
for (const [k, v] of Object.entries(extra)) (OTHER[k] ||= new Set()).add(v)
console.log('DESIGN_FIELDS (' + DF.length + '):', DF.join(' '))
console.log('bake-scene design.<key> reads (' + BS_READS.size + '):', [...BS_READS].sort().join(' '))
const neverScene = DF.filter(k => !BS_READS.has(k))
console.log('\n(c) DESIGN_FIELDS not read by bake-scene:', neverScene.map(k => k + (OTHER[k] ? `[→${[...OTHER[k]].join(',')}]` : '[NO BAKE READER FOUND]')).join(' '))
const looks = readdirSync(join(ROOT, 'public/looks'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const iso = (ms) => new Date(ms).toISOString().slice(0, 16)
for (const id of looks) {
  const dp = join(ROOT, 'public/looks', id, 'design.json'), sp = join(ROOT, 'public/baked', id, 'scene.json')
  if (!existsSync(dp) || !existsSync(sp)) { console.log(`\n## ${id}: design=${existsSync(dp)} scene=${existsSync(sp)} — skipped`); continue }
  const d = JSON.parse(readFileSync(dp, 'utf8')), s = JSON.parse(readFileSync(sp, 'utf8'))
  const dk = Object.keys(d), sk = Object.keys(s)
  const dm = statSync(dp).mtimeMs, sm = statSync(sp).mtimeMs
  console.log(`\n## ${id}  design.json mtime ${iso(dm)} · scene.json mtime ${iso(sm)} · scene.bakedAt ${s.bakedAt ? iso(s.bakedAt) : '—'} · slab ${sm < dm ? 'OLDER than authoring by ' + ((dm - sm) / 3.6e6).toFixed(1) + ' h' : 'newer'}`)
  const discarded = dk.filter(k => !(k in s) && !(k === 'buildingPalette' && 'palette' in s))
  console.log('(a) design keys NOT in scene.json:', discarded.map(k => k + (OTHER[k] ? `[→${[...OTHER[k]].join(',')}]` : '')).join(' ') || '—')
  const added = sk.filter(k => !(k in d) && !(k === 'palette' && 'buildingPalette' in d))
  console.log('(b) scene keys NOT in design.json (substituted/stamped):', added.join(' ') || '—')
  const notInDF = dk.filter(k => !DF.includes(k))
  console.log('    design keys not in DESIGN_FIELDS (server-merge keepers or rot):', notInDF.join(' ') || '—')
  // verbatim check for carried keys
  const changed = dk.filter(k => k in s && JSON.stringify(d[k]) !== JSON.stringify(s[k]))
  console.log('    carried keys whose scene value != design value (stale slab or transform):', changed.join(' ') || '—')
}
