#!/usr/bin/env node
// claims-a-look-authors-its-curb-width.mjs — DOES EVERY LOOK RESOLVE ONE CURB, FROM ONE HOME, AND SAY WHICH RUNG DECIDED?
//
// ⭐ THE CLAIM (Jacob, 2026-10-20: "6 inches everywhere"; Boz's ruling the same day, reversing only the "no default at
// all" half of 2026-10-19's). `curbWidth` is a fact about a town (`cartograph/lookDesign.mjs#TOWN_DESIGN_FIELDS`), authored
// in its home Look; a town that authors none inherits the KIT's 6 in, declared ONCE (`src/cartograph/streetProfiles.js
// #KIT_CURB_WIDTH`) and resolved by ONE function (`resolveCurbWidth` → { value, rung: 'authored' | 'kit' }) that the bake
// (`lookDesign.mjs`), the store and the probe feed all import — so no instrument measures a curb the bake does not draw.
// The default is resolved at the DESIGN-READ layer only: a builder called with no width still refuses.
// Four judges, each reading the source of truth rather than restating it:
//   1 · ONE HOME, EVERY LOOK RESOLVES — the home's source declares KIT_CURB_WIDTH as a number in metres, its resolver
//       resolves absent → kit, a number → authored, junk → refusal; lookDesign re-exports the same function, the store
//       and the feed import it, the bake prints the rung; and every Look naming a scene resolves a width and names its rung.
//   2 · NO SECOND 6, NO SUBSTITUTE, NO RAW READ — in src/, cartograph/, checks/ and scratch/_proto-feed.mjs, no line
//       outside the home: supplies a constant when the curb width is absent (`?? n` · `|| n` · `isFinite(…) ? … : n` · a
//       parameter default) · writes a 6 in literal (`0.1524`, `6 * 0.0254`) · reads `design.curbWidth` (or the store's
//       authored-or-null `s.curbWidth`) instead of the resolver · names KIT_CURB_WIDTH or resolveCurbWidth in a builder.
//   3 · THE BUILDERS REFUSE — buildTileGround and buildBlockGeometryV2, called with no curbWidth, throw naming the fix.
//   4 · THE SAVE NEVER WRITES THE KIT — the store hydrates an absent curbWidth to null (evaluated from its descriptor),
//       the serializer drops a null one, and the initial state carries no number.
//   5 · THE STREET DEFAULTS' ONE HOME — the local class row (`src/cartograph/streetClass.js`, Jacob 2026-10-20 "yes to
//       imperial") carries treelawn 1.524 · sidewalk 1.524 · corner R 4.572 m, each naming its registry finding; the painter's
//       unauthored depths and ②'s base radius read it; row 2 also finds a second copy anywhere in src/ or cartograph/.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the kit default deleted from the home → 1, by name · (b) a literal 0.1524
// put into buildTileGround → 2 · (c) a raw design.curbWidth read put into an instrument → 2 · (d) the store hydrating to
// the kit's value, and the serializer's drop removed → 4 · (e) the local row back to 1.5/1.5/4.5 → 5 · (f) STD_TREELAWN = 1.5
// back in tileGround → 2 · (g) ②'s base radius back to `opts.cornerR ?? 4.5` → 2 and 5 · (h) `curb: 0.15` back in a class row → 2.
//   node checks/claims-a-look-authors-its-curb-width.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import fs from 'fs'
import path from 'path'

let bad = 0
const FIX = 'pass the width the design reader resolved'
const HOME = 'src/cartograph/streetProfiles.js', STORE = 'src/cartograph/stores/useCartographStore.js', FEED = 'scratch/_proto-feed.mjs'
const BUILDERS = ['src/lib/tileGround.js', 'src/lib/buildBlockGeometryV2.js']
const read = (f) => fs.readFileSync(f, 'utf8')

// ── 1 · ONE HOME, EVERY LOOK RESOLVES ────────────────────────────────────────
// The declaration is judged from the home's SOURCE (so a mutant of it is judged by the same code); the resolver, live.
const home = await import('../src/cartograph/streetProfiles.js')
function judgeHome(text, M) {
  const why = []
  const decl = text.match(/^export const KIT_CURB_WIDTH = ([\d.]+)\b/m)
  if (!decl || !(Number(decl[1]) > 0)) why.push(`${HOME} declares no KIT_CURB_WIDTH as a number in metres — the kit default is gone`)
  if (typeof M.resolveCurbWidth !== 'function') { why.push(`${HOME} exports no resolveCurbWidth`); return why }
  const tryR = (d) => { try { return M.resolveCurbWidth(d) } catch (e) { return { threw: e.message } } }
  const absent = tryR({}), nul = tryR({ curbWidth: null }), own = tryR({ curbWidth: 0.3 }), junk = tryR({ curbWidth: 'six' })
  if (!(absent.rung === 'kit' && absent.value === M.KIT_CURB_WIDTH && Number.isFinite(absent.value))) why.push(`an absent curbWidth resolves to ${JSON.stringify(absent)}, not the kit's ${M.KIT_CURB_WIDTH} (rung 'kit')`)
  if (!(nul.rung === 'kit' && nul.value === M.KIT_CURB_WIDTH)) why.push(`a null curbWidth resolves to ${JSON.stringify(nul)}, not the kit's`)
  if (!(own.rung === 'authored' && own.value === 0.3)) why.push(`an authored 0.3 resolves to ${JSON.stringify(own)}`)
  if (!junk.threw) why.push(`an authored "six" resolves to ${JSON.stringify(junk)} instead of refusing`)
  return why
}
const H = judgeHome(read(HOME), home)
const LD = await import('../cartograph/lookDesign.mjs')
const wire = []
if (LD.resolveCurbWidth !== home.resolveCurbWidth) wire.push('lookDesign.mjs does not re-export the home\'s resolveCurbWidth')
if (!/import \{[^}]*\bresolveCurbWidth\b[^}]*\} from '\.\.\/streetProfiles\.js'/.test(read(STORE))) wire.push(`${STORE} does not import resolveCurbWidth from the home`)
if (!/import \{[^}]*\bresolveCurbWidth\b[^}]*\} from '\.\.\/src\/cartograph\/streetProfiles\.js'/.test(read(FEED))) wire.push(`${FEED} does not import resolveCurbWidth from the home`)
if (!/curbWidth: bakeCurbWidth\(design\b/.test(read('cartograph/bake-ground.js'))) wire.push('bake-ground.js does not take its curb from lookDesign.mjs#bakeCurbWidth')
const said = (d) => { const o = console.log, out = []; console.log = (...a) => out.push(a.join(' ')); try { LD.bakeCurbWidth(d, 'check') } finally { console.log = o } return out.join('\n') }
if (!/\bkit\b/.test(said({})) || !/\bauthored\b/.test(said({ curbWidth: 0.2 }))) wire.push('bakeCurbWidth does not print the rung that decided')
if (!LD.SEED_STRIPPED_FIELDS.includes('curbWidth')) wire.push('SEED_STRIPPED_FIELDS does not strip curbWidth — a seeded Look would carry another town\'s curb as authored')
const looks = JSON.parse(read('public/looks/index.json')).looks.filter(l => l.scene)
const L = looks.map(l => { try { return { id: l.id, ...LD.resolveCurbWidth(LD.readBakeDesign(l.id, l.scene, 'curb check')) } } catch (e) { return { id: l.id, threw: String(e.message).split('\n')[0].slice(0, 140) } } })
const unresolved = L.filter(t => t.threw)
const one = !H.length && !wire.length && !unresolved.length
console.log(`${one ? '✅' : '⛔'} 1 one home (${HOME}#KIT_CURB_WIDTH = ${home.KIT_CURB_WIDTH} m), every Look resolves: ${L.length} Look(s) with a scene · ` +
  `authored ${L.filter(t => t.rung === 'authored').length} · kit ${L.filter(t => t.rung === 'kit').length} · unresolved ${unresolved.length}`)
for (const w of [...H, ...wire]) console.log(`      ⛔ ${w}`)
for (const t of L) console.log(`      ${t.id.padEnd(20)} ${t.threw ? `⛔ ${t.threw}` : `${t.value} m · ${t.rung}`}`)
if (!one) bad++

// ── 2 · NO SECOND 6, NO SUBSTITUTE, NO RAW READ ──────────────────────────────
const RULES = [
  ['substitute', /curbWidth\b[^\n]*?(\?\?|\|\|)\s*((KIT_)?CURB_WIDTH|\d)/],                       // x.curbWidth ?? 0.1524
  ['substitute', /isFinite\([^)]*curbWidth\)\s*\?[^:\n]*:\s*((KIT_)?CURB_WIDTH|\d)/],              // isFinite(curbWidth) ? curbWidth : 6
  ['substitute', /^\s*(const|let|var)?\s*\{?[^\n]*\bcurbWidth\s*=\s*((KIT_)?CURB_WIDTH|\d)/],      // a parameter default / assignment
  ['second 6', /(?<![\d.])0\.1524(?!\d)|\b6\s*\*\s*0\.0254\b|\b0\.0254\s*\*\s*6\b/],                // the kit's number, restated
  ['second 6', /\bcurb\w*\s*[:=]\s*0\.15\b|\.curb\)\s*\?[^:\n]*:\s*\d/],                             // a 0.15 curb in a curb role (streetClass's rows carried one)
  ['raw read', /\b(\w*[dD]esign\w*|d|D)\??\.curbWidth\b|design\.json[^\n]*\)\??\.curbWidth\b/],    // design.curbWidth, not resolved
  ['raw read', /\b(s|store|state)\??\.curbWidth\b/],                                              // the store's authored-or-null, not curbWidthOf
]
// ⭐ THE KIT'S STREET DEFAULTS HAVE ONE HOME TOO — the local class row (`streetClass.js`, Jacob 2026-10-20 "yes to imperial"):
// treelawn 5 ft, sidewalk 5 ft, corner radius 15 ft. In the product (src/, cartograph/; a check's fixture measure is data),
// outside that file, no line declares a second copy or restates the value.
const CLASS_HOME = 'src/cartograph/streetClass.js'
const STREET_RULES = [
  /\b(STD_TREELAWN|ADA_SIDEWALK|SV_SIDEWALK)\s*=/,                                                  // a named second copy
  /\b(treelawn|sidewalk|treeLawn)\s*:\s*(1\.5|1\.524|4\.5\s*\*\s*FT|5\s*\*\s*FT)\b/,                // a default width written in place
  /\b(baseR|R_CLASS_DEFAULT|DEFAULT_R|curbReturnRadius)\b\s*[:=][^\n]*?((?<![\d.])(4\.5|4\.572)(?!\d)|\b15\s*\*\s*FT)/,   // a radius default
  /cornerR\b[^\n]*?(\?\?|\|\||:)\s*4\.5\b/,                                                         // a radius fallback
  /(?<![\d.])(1\.524|4\.572)(?!\d)/,                                                                  // the home's value, restated
]
const BUILDER_RULE = /\b(KIT_CURB_WIDTH|resolveCurbWidth)\b/                                        // a builder resolving the default itself
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['node_modules', '_archive'].includes(e.name) ? [] : walk(path.join(d, e.name)))
  : /\.(m?js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : [])
const SELF = path.relative(process.cwd(), new URL(import.meta.url).pathname)
const FILES = [...walk('src'), ...walk('cartograph'), ...walk('checks'), FEED].filter(f => f !== SELF && f !== HOME)
function offences(textOf) {
  const out = []
  for (const f of FILES) textOf(f).split('\n').forEach((s, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(s)) return                                         // a comment names the old way; it reads nothing
    const code = s.replace(/\/\/.*$/, '')
    for (const [kind, rx] of RULES) {
      if (f === STORE && kind === 'raw read') continue                               // the store's own read of what is authored: judge 4
      if (rx.test(code)) { out.push(`${kind.padEnd(10)} ${f}:${i + 1}  ${s.trim().slice(0, 130)}`); return }
    }
    if (BUILDERS.includes(f) && BUILDER_RULE.test(code)) out.push(`builder    ${f}:${i + 1}  ${s.trim().slice(0, 130)}`)
    else if (f !== CLASS_HOME && /^(src|cartograph)\//.test(f) && STREET_RULES.some(rx => rx.test(code))) out.push(`street 2nd ${f}:${i + 1}  ${s.trim().slice(0, 130)}`)
  })
  return out
}
const S = offences(read)
console.log(`${S.length ? '⛔' : '✅'} 2 no second 6, no substitute, no raw read: ${FILES.length} source file(s) read · offending lines ${S.length}`)
for (const s of S) console.log(`      ${s}`)
if (S.length) bad++

// ── 3 · THE BUILDERS REFUSE ──────────────────────────────────────────────────
const { buildTileGround } = await import('../src/lib/tileGround.js')
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const refuses = (fn) => { try { fn(); return { ok: false, why: 'returned' } } catch (e) { return { ok: String(e.message).includes(FIX), why: String(e.message).split('\n')[0].slice(0, 160) } } }
for (const [name, fn] of [['buildTileGround', () => buildTileGround({ streets: [] }, {})], ['buildBlockGeometryV2', () => buildBlockGeometryV2({ streets: [] }, {})]]) {
  const r = refuses(fn); if (!r.ok) bad++
  console.log(`${r.ok ? '✅' : '⛔'} 3 ${name} with no curbWidth: ${r.ok ? 'refuses, naming the fix' : `⛔ does not refuse by name (${r.why})`}`) }

// ── 4 · THE SAVE NEVER WRITES THE KIT ────────────────────────────────────────
function judgeStore(src) {
  const why = []
  const m = src.match(/\{\s*key:\s*'curbWidth',\s*hydrate:\s*(\(d\)\s*=>[^\n]*?)\s*\},?\s*(\/\/[^\n]*)?\n/)
  if (!m) return [`${STORE}: no curbWidth DESIGN_FIELDS descriptor found — re-aim the check`]
  let hydrate; try { hydrate = new Function('resolveCurbWidth', 'KIT_CURB_WIDTH', `return ${m[1]}`)(home.resolveCurbWidth, home.KIT_CURB_WIDTH) } catch (e) { return [`the curbWidth hydrator does not evaluate (${e.message})`] }
  const h0 = hydrate({}), h1 = hydrate({ curbWidth: 0.2 })
  if (h0 != null) why.push(`an absent curbWidth hydrates to ${h0} — the next autosave writes it into the town as authored`)
  if (h1 !== 0.2) why.push(`an authored 0.2 hydrates to ${h1}`)
  const ser = src.match(/function serializeDesign\(s\) \{[\s\S]*?\n\}/)?.[0] || ''
  if (!/if \(out\.curbWidth == null\) delete out\.curbWidth/.test(ser)) why.push('serializeDesign does not drop an unauthored curbWidth')
  if (/^\s*curbWidth:\s*((KIT_)?CURB_WIDTH|\d)/m.test(src)) why.push('the store\'s initial state carries a curb width')
  return why
}
const ST = judgeStore(read(STORE))
console.log(`${ST.length ? '⛔' : '✅'} 4 the save never writes the kit: ${ST.length ? '' : 'absent hydrates to null, the serializer drops it, no initial number'}`)
for (const w of ST) console.log(`      ⛔ ${w}`)
if (ST.length) bad++

// ── 5 · THE STREET DEFAULTS' ONE HOME — the local class row, exact US values, each with its finding ─────────────────────
const STREET_HOME = [['treelawn', 1.524, 'f-massdot-buffer-width'], ['sidewalk', 1.524, 'f-massdot-sidewalk-width'], ['cornerR', 4.572, 'f-caltrans-corner-radii']]
const registryIds = new Set((JSON.parse(read('references/registry.json')).findings || []).map(x => x.id))
const { LOCAL_SECTION } = await import('../src/cartograph/streetClass.js')
const { resolvePedDepths } = await import('../src/lib/tileGround.js')
function judgeStreetHome(classSrc, tgSrc) {
  const why = [], m = classSrc.match(/^\s*'local':[^\n]*\bstreet\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/m)
  if (!m) return [`${CLASS_HOME}: no local row of the form street(lane, parking, treelawn, sidewalk, cornerR) — re-aim the check`]
  STREET_HOME.forEach(([k, v, id], j) => {
    if (+m[j + 1] !== v) why.push(`the local row's ${k} is ${m[j + 1]}, not ${v} m — the kit's US default is gone`)
    if (!classSrc.includes(id)) why.push(`${CLASS_HOME} does not name ${id} for its ${k}`)
    if (!registryIds.has(id)) why.push(`${id} is not a finding in references/registry.json`)
  })
  if (!/const baseR = LOCAL_SECTION\.cornerR\b/.test(tgSrc)) why.push('buildTileGround\'s base corner radius does not read LOCAL_SECTION.cornerR')
  return why
}
const SH = judgeStreetHome(read(CLASS_HOME), read(BUILDERS[0]))
const d0 = resolvePedDepths({ left: {} }, 'left', null)
if (d0.tl !== LOCAL_SECTION.treelawn || d0.sw !== LOCAL_SECTION.sidewalk) SH.push(`the painter's unauthored depths are tl ${d0.tl} / sw ${d0.sw}, not the local row's`)
console.log(`${SH.length ? '⛔' : '✅'} 5 street defaults, one home (${CLASS_HOME}, local row): treelawn ${LOCAL_SECTION.treelawn} · sidewalk ${LOCAL_SECTION.sidewalk} · corner R ${LOCAL_SECTION.cornerR} m — the painter and ② read it`)
for (const w of SH) console.log(`      ⛔ ${w}`)
if (SH.length) bad++

// ── MUTANTS ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--mutants')) {
  const res = []
  const verdict = (name, ran, red, extra = '') => { res.push(`${name}: ${!ran ? '⛔ not run (the site moved — re-aim the mutant)' : red ? `RED, as it must be${extra}` : '⛔ still GREEN'}`); if (!ran || !red) bad++ }
  // (a) the kit default deleted from the home
  const hs = read(HOME), hNo = hs.replace(/^export const KIT_CURB_WIDTH = [^\n]*\n/m, '')
  const ha = hNo !== hs ? judgeHome(hNo, home) : []
  verdict('a · the kit default deleted', hNo !== hs, ha.some(w => /KIT_CURB_WIDTH/.test(w)), ha.length ? ` (${ha[0].slice(0, 90)})` : '')
  // (b) a literal 0.1524 put into a builder
  const TG = BUILDERS[0], tg = read(TG), tgPut = tg.replace(/^(\s*)const curbWidth = opts\.curbWidth$/m, '$1const curbWidth = opts.curbWidth ?? 0.1524')
  verdict('b · a literal 0.1524 in buildTileGround', tgPut !== tg, offences(f => f === TG ? tgPut : read(f)).length > S.length)
  // (c) a raw design.curbWidth read put into an instrument
  const IN = 'checks/claims-node-pair-key-parity.mjs', ins = read(IN), insPut = ins.replace('curbWidth: resolveCurbWidth(design).value,', 'curbWidth: design.curbWidth,')
  verdict('c · a raw design.curbWidth in an instrument', insPut !== ins, offences(f => f === IN ? insPut : read(f)).length > S.length)
  // (d) the store hydrating to the kit's value · the serializer's drop removed
  const st = read(STORE)
  const stHyd = st.replace(/(key: 'curbWidth',\s*hydrate: )\(d\) => [^\n]*? \},/, "$1(d) => resolveCurbWidth(d).value },")
  const stSer = st.replace(/^\s*if \(out\.curbWidth == null\) delete out\.curbWidth\n/m, '')
  verdict('d1 · the store hydrating to the kit', stHyd !== st, judgeStore(stHyd).length > ST.length)
  verdict('d2 · the serializer writing an unauthored curb', stSer !== st, judgeStore(stSer).length > ST.length)
  // (e) the local row back to its metric guesses · (f) a named copy back in the painter · (g) ②'s literal back · (h) 0.15 curb back in a row
  const cs = read(CLASS_HOME), csOld = cs.replace(/(\bstreet\(\s*10\s*,\s*8\s*,\s*)1\.524\s*,\s*1\.524\s*,\s*4\.572\s*\)/, '$11.5, 1.5, 4.5)')
  verdict('e · the local row back to 1.5 / 1.5 / 4.5', csOld !== cs, judgeStreetHome(csOld, read(BUILDERS[0])).length > SH.length)
  const tgS = read(TG), tgF = tgS.replace(/^(import \{ LOCAL_SECTION \} from[^\n]*\n)/m, '$1const STD_TREELAWN = 1.5\n')
  verdict('f · STD_TREELAWN = 1.5 back in tileGround', tgF !== tgS, offences(f => f === TG ? tgF : read(f)).length > S.length)
  const tgG = tgS.replace(/const baseR = LOCAL_SECTION\.cornerR\b/, 'const baseR = Number.isFinite(opts.cornerR) ? opts.cornerR : 4.5')
  verdict('g · ②\'s base radius back to opts.cornerR ?? 4.5', tgG !== tgS, offences(f => f === TG ? tgG : read(f)).length > S.length && judgeStreetHome(cs, tgG).length > SH.length)
  const csH = cs.replace(/(const street = \(lane, parking, treelawn, sidewalk, cornerR\) => \(\{ lane: lane \* FT, parking: parking \* FT, treelawn, sidewalk, )cornerR \}\)/, '$1curb: 0.15, cornerR })')
  verdict('h · curb: 0.15 back in a class row', csH !== cs, offences(f => f === CLASS_HOME ? csH : read(f)).length > S.length)
  for (const r of res) console.log(`   mutant ${r}`)
}
console.log(bad ? '\n⛔ RED — the curb has no single home, a reader bypasses it, a builder resolves or refuses wrongly, or the save writes the kit'
  : '\n✅ GREEN — every Look resolves its curb from one home and names the rung')
process.exit(bad ? 1 : 0)
