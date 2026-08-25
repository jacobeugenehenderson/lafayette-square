/**
 * Taxonomy cutover 19 → 31 axes. PROPOSAL-rubric-axes.md, approved 2026-08-24.
 * ⛔ Rewrites authored state (rubric.json, dossiers, part-index). Reversible via git.
 * ⛔ NO GUESSING: a value that cannot be resolved deterministically is DROPPED and REPORTED.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
const ROOT = process.cwd()
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'))
const wr = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n')

const RUBRIC = path.join(ROOT, 'arborist/rubric.json')
const rubric = rd(RUBRIC)
const byId = new Map(rubric.axes.map(a => [a.id, a]))
const mk = (id, partType, name, kind, values, plain) => ({ id, partType, name, kind, ...(values ? { values } : {}), plain })

// ── 1. rubric ───────────────────────────────────────────────────────────────
const HABIT = ['columnar','fastigiate','oval','ovoid','rounded','spreading','vase','weeping','pyramidal','conical','irregular','multi-stem','arching','ascending','horizontal']
const SHAPE = ['acicular','cordate','deltoid','elliptical','flabellate','lanceolate','linear','oblanceolate','oblong','obovate','orbicular','ovate','reniform','rhomboid','spatulate']
const MARGIN = ['entire','serrate','doubly-serrate','dentate','doubly-dentate','crenate','lobed','sinuate','undulate','spinose']
const LTYPE = ['simple','compound-pinnate','compound-bipinnate','compound-palmate','needle','scale','frond']
const ARRANGE = ['alternate','opposite','whorled','rosulate']
const GROWTHWAY = ['as-modeled','alternate-scatter','opposite','drooping','sprays','clusters']
const BTEX = ['smooth','fissured','furrowed','ridged','plated','scaly','shaggy','exfoliating','papery','lenticellate','mottled','fibrous','warty']
const POUTLINE = ['diamond','rectangular','square','oval','round','irregular']
const FOLIAGE = ['deciduous','broadleaf-evergreen','needled-evergreen','semi-evergreen','deciduous-conifer']
const CTEX = ['fine','medium','coarse']
const FRUIT = ['samara','acorn','drupe','legume','pome','cone','capsule','nut','berry','none']
const APPEND = ['prickles','spines','tendrils','thorns','none']

// habit: expand in place
byId.get('chassis.habit').values = HABIT
// bark.type -> bark.texture (rename, values are all texture terms)
const bt = byId.get('bark.type'); bt.id = 'bark.texture'; bt.name = 'Bark texture / surface'; bt.values = BTEX
// leaf.size -> leaf.length
const ls = byId.get('leaf.size'); ls.id = 'leaf.length'; ls.name = 'Leaf length'

const out = []
for (const a of rubric.axes) {
  if (a.id === 'leaf.silhouette') {
    out.push(mk('leaf.type','leaf','Leaf type','enum',LTYPE,'Simple, compound, needle or scale.'))
    out.push(mk('leaf.shape','leaf','Leaf shape','enum',SHAPE,'The outline of one leaf.'))
    out.push(mk('leaf.margin','leaf','Leaf margin','enum',MARGIN,'The edge — smooth, toothed or lobed.'))
    continue
  }
  if (a.id === 'leaf.ways') {
    out.push(mk('leaf.arrangement','leaf','Leaf arrangement (phyllotaxis)','enum',ARRANGE,'Where leaves attach to the stem. Botanical.'))
    out.push({ ...mk('leaf.growthway','leaf','Growthway','enum',GROWTHWAY,'How foliage is placed and hangs on the chassis. A RENDERING DIRECTIVE, not a botanical fact — "as-modeled" keeps the chassis\'s own geometry.'), authored: true })
    continue
  }
  out.push(a)
  if (a.id === 'bark.texture') out.push(mk('bark.plate_outline','bark','Bark plate outline','enum',POUTLINE,'The shape of one plate, where bark is plated.'))
  if (a.id === 'leaf.length') out.push(mk('leaf.width','leaf','Leaf width','scalar',null,'Leaf width. With length it gives the aspect ratio, which is the species read.'))
}
out.push(mk('leaf.foliage_type','leaf','Foliage type','enum',FOLIAGE,'Deciduous, evergreen, or a deciduous conifer.'))
out.push(mk('crown.base_height','chassis','Crown base height','scalar',null,'How far up the trunk the canopy starts, in metres.'))
out.push(mk('crown.ratio','chassis','Live crown ratio','scalar',null,'Fraction of total height carrying canopy.'))
out.push(mk('crown.texture','chassis','Crown texture','enum',CTEX,'Whole-crown coarseness read from a distance.'))
out.push(mk('overlay.fruit_type','overlay','Fruit type','enum',FRUIT,'A samara and an acorn are different props.'))
out.push(mk('overlay.appendage','overlay','Appendage','enum',APPEND,'Prickles, spines, tendrils or thorns.'))
out.push(mk('overlay.conspicuous','overlay','Conspicuousness','enum',['showy','present','insignificant'],'Whether an overlay is worth spawning at all.'))

rubric.axes = out
rubric.version = (rubric.version || 1)
rubric._cutover = { at: '2026-08-24', from: 19, to: out.length, spec: 'PROPOSAL-rubric-axes.md' }
wr(RUBRIC, rubric)
console.log(`rubric: 19 → ${out.length} axes`)

// ── 2. value migration ──────────────────────────────────────────────────────
// ⛔ palmate / star are the CONFLATED tokens the split exists to expose. They cannot be
// resolved deterministically (palmate = type OR margin; star = shape AND margin), so they
// are DROPPED and REPORTED rather than guessed.
const SIL = {
  lobed:      ['leaf.margin','lobed'],
  ovate:      ['leaf.shape','ovate'],
  heart:      ['leaf.shape','cordate'],
  lanceolate: ['leaf.shape','lanceolate'],
  fan:        ['leaf.shape','flabellate'],
  compound:   ['leaf.type','compound-pinnate'],
  needle:     ['leaf.type','needle'],
  scale:      ['leaf.type','scale'],
}
const WAYS = {
  alternate: ['leaf.arrangement','alternate'],
  opposite:  ['leaf.arrangement','opposite'],
  sprays:    ['leaf.growthway','sprays'],
  clusters:  ['leaf.growthway','clusters'],
  'all-one-direction': ['leaf.growthway','drooping'],
}
const dropped = []
const migrate = (obj, where, isTag) => {
  let changed = false
  for (const [oldKey, map] of [['leaf.silhouette', SIL], ['leaf.ways', WAYS]]) {
    if (!(oldKey in obj)) continue
    const cell = obj[oldKey]
    const val = isTag ? cell?.value : cell?.target
    const hit = val == null ? null : map[String(val)]
    if (hit) { obj[hit[0]] = isTag ? { ...cell, value: hit[1] } : { ...cell, target: hit[1] } }
    else if (val != null) dropped.push(`${where}  ${oldKey}="${val}"  → no deterministic target`)
    delete obj[oldKey]; changed = true
  }
  if ('bark.type' in obj) { obj['bark.texture'] = obj['bark.type']; delete obj['bark.type']; changed = true }
  if ('leaf.size' in obj) { obj['leaf.length'] = obj['leaf.size']; delete obj['leaf.size']; changed = true }
  return changed
}

const dDir = path.join(ROOT, 'arborist/dossiers')
for (const f of readdirSync(dDir).filter(x => x.endsWith('.json'))) {
  const p = path.join(dDir, f); const d = rd(p)
  if (d.required && migrate(d.required, `dossiers/${f}`, false)) wr(p, d)
}
const PI = path.join(ROOT, 'arborist/state/part-index.json')
const pi = rd(PI); let touched = 0
for (const part of pi.parts || []) if (part.tags && migrate(part.tags, `part ${part.partId}`, true)) touched++
wr(PI, pi)
console.log(`part-index: ${touched} parts migrated`)

console.log('')
if (dropped.length) {
  console.log(`⛔ ${dropped.length} value(s) DROPPED — conflated tokens with no deterministic target.`)
  console.log('   These are exactly what the split exists to expose. Re-author them:')
  for (const d of dropped) console.log('   ' + d)
} else console.log('no values dropped')
