#!/usr/bin/env node
/**
 * "WHOSE TOWN DOES THIS OVERRIDE BELONG TO?" — A11, the provenance classifier.
 *
 * WHY THIS EXISTS (2026-08-07). Authoring is keyed by the FROZEN RUN IDENTITY —
 * `blockCustoms[skelId][side][segOrd]` (SECTION §3.2). The key is a NAME, and a
 * name is portable: `park-avenue-1|right|0` is a perfectly well-formed key in
 * Altadena, California and in Łódź, Poland. Nothing in the resolver asks whether
 * the run it names belongs to THIS town. So a Look seeded from another Look
 * carries the seed town's authoring into the new town's artifact, silently, and
 * the only symptom is that it does nothing — UNTIL the new town happens to have
 * a street of the same name, at which point the seed town's measured widths
 * apply to it and the operator sees a plausible map (CLAUDE.md Layer 0, q2, in
 * the artifact rather than in code).
 *
 * ⭐ THE CLASSIFIER IS THE DELIVERABLE, NOT TODAY'S NUMBERS. It carries no
 * knowledge of Lafayette Square, of street names, or of which towns are
 * suspect. Its whole method is: compare each authored key against every bake's
 * `runs[]`, and let the town that owns the run name itself. It runs unchanged on
 * a town nobody has looked at.
 *
 * THE FOUR VERDICTS — per override slot:
 *   ✅ RESOLVED      the key names a run in THIS scene's own bake. Live authoring.
 *   ⛔ BLED          the key names no run here, but DOES name a run in another
 *                    scene's bake. That town is named in the report. This is the
 *                    A11 class: one town's authoring sitting in another's file.
 *   ⚠️ STALE         the key resolves to no bake at all, its own included. A
 *                    different condition sharing a symptom — usually a re-skeleton
 *                    renumbering runs under a street this town really does have.
 *                    Sub-reasons distinguish them (see STALE_* below).
 *   ⛔ UNCLASSIFIABLE a slot whose key is not the documented shape. Loud, never
 *                    a silent skip.
 *
 * ⭐ PRECEDENCE, and why: a key whose STREET exists in this town's own bake is
 * never called BLED even when a foreign bake also matches the full triple —
 * the town owns its own street names. It is reported STALE/renumbered, and if a
 * foreign bake matched too it is additionally marked `⚠️ AMBIGUOUS` so the
 * coincidence is on the page instead of being resolved by guess.
 *
 * ⛔ A scene with no bake, or a Look with no design, reports NOT CHECKED with a
 * reason. It never reports ✅. A green that means "nothing was measured" is the
 * exact failure this file exists to prevent.
 *
 * ⭐ SECOND PASS — the rest of the design. `blockCustoms` is not the only
 * scene-keyed map in a Look; `cornerCornerRadiusOverrides` keys embed street
 * names AND local coordinates, and a future field will too. Rather than hard-code
 * each key grammar (which would go blind on the next one), the second pass walks
 * the WHOLE design recursively, splits every object key on the separators the
 * codebase uses (`| : ,`), and asks whether any token is a street name known to
 * some bake. Zero grammar assumptions — a field added tomorrow is covered.
 *
 * ⛔ READ-ONLY. Reads public/looks/index.json, public/looks/<id>/design.json,
 *    public/baked/<scene>/shape.json. Writes nothing, bakes nothing, deletes
 *    nothing. Deleting authoring is the operator's call, never a detector's.
 *
 * Usage:
 *   node scratch/claims-override-provenance.mjs            # every Look
 *   node scratch/claims-override-provenance.mjs altadena   # one Look
 *   node scratch/claims-override-provenance.mjs --slots    # every slot, one line each
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT   = new URL('..', import.meta.url).pathname
const LOOKS  = join(ROOT, 'public/looks')
const BAKED  = join(ROOT, 'public/baked')
const argv   = process.argv.slice(2)
const SLOTS  = argv.includes('--slots')
const ONLY   = argv.filter(a => !a.startsWith('--'))

const STALE_RENUMBERED = 'street present in own bake, this side/segOrd is not'
const STALE_ORPHAN     = 'street named by no bake anywhere'

// ── the bakes ───────────────────────────────────────────────────────────────
// Every scene with a shape.json, reduced to the two identity sets the classifier
// needs: exact run triples, and bare street names. Both come out of runs[] — the
// same field sectionPass resolves against, so the detector cannot disagree with
// the construction about what "exists".
const readBake = (scene) => {
  const p = join(BAKED, scene, 'shape.json')
  if (!existsSync(p)) return null
  let raw
  try { raw = JSON.parse(readFileSync(p, 'utf8')) }
  catch (err) { return { scene, broken: String(err.message) } }
  const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])   // toy freezes a bare array
  const triples = new Set(), streets = new Set()
  for (const t of tiles) for (const r of (t.runs || [])) {
    triples.add(`${r.skelId}|${r.side}|${r.segOrd}`)
    streets.add(String(r.skelId))
  }
  return { scene, tiles: tiles.length, triples, streets }
}

const bakes = new Map()
for (const scene of readdirSync(BAKED)) {
  if (!statSync(join(BAKED, scene)).isDirectory()) continue
  const b = readBake(scene)
  if (b) bakes.set(scene, b)
}
const allStreets = new Set()
for (const b of bakes.values()) for (const s of (b.streets || [])) allStreets.add(s)

// ── the looks ───────────────────────────────────────────────────────────────
// ⭐ The look→scene binding comes from index.json, NEVER from the directory name.
// They coincide today only because the Pour names the Look after the scene; a
// detector that assumed it would mis-attribute every hand-named Look.
const idx = JSON.parse(readFileSync(join(LOOKS, 'index.json'), 'utf8'))
const registered = new Map(idx.looks.map(l => [l.id, l]))
const lookDirs = readdirSync(LOOKS).filter(d => statSync(join(LOOKS, d)).isDirectory())

const looks = []
for (const id of lookDirs) {
  if (ONLY.length && !ONLY.includes(id)) continue
  const entry = registered.get(id)
  const designPath = join(LOOKS, id, 'design.json')
  let design = null, designErr = null
  if (existsSync(designPath)) {
    try { design = JSON.parse(readFileSync(designPath, 'utf8')) }
    catch (err) { designErr = String(err.message) }
  }
  looks.push({ id, entry, scene: entry?.scene ?? null, design, designErr })
}
for (const [id, l] of registered) {                       // indexed but no directory
  if (ONLY.length && !ONLY.includes(id)) continue
  if (!lookDirs.includes(id)) looks.push({ id, entry: l, scene: l.scene, design: null, designErr: 'no look directory' })
}
looks.sort((a, b) => a.id.localeCompare(b.id))

// ── pass 1: blockCustoms slots ──────────────────────────────────────────────
const classifySlot = (skelId, side, segOrd, own) => {
  const triple = `${skelId}|${side}|${segOrd}`
  const foreign = [...bakes.values()].filter(b => b.scene !== own?.scene && b.triples?.has(triple)).map(b => b.scene)
  if (own?.triples?.has(triple)) return { verdict: 'RESOLVED', triple, foreign }
  if (own?.streets?.has(skelId)) {
    return { verdict: 'STALE', why: STALE_RENUMBERED, triple, foreign, ambiguous: foreign.length > 0 }
  }
  if (foreign.length) return { verdict: 'BLED', triple, foreign }
  // The street is unknown to this bake. Is it known to ANY bake, at any ord?
  const nameElsewhere = [...bakes.values()].filter(b => b.scene !== own?.scene && b.streets?.has(skelId)).map(b => b.scene)
  if (nameElsewhere.length) return { verdict: 'BLED', triple, foreign: nameElsewhere, nameOnly: true }
  return { verdict: 'STALE', why: STALE_ORPHAN, triple, foreign: [] }
}

const results = []
for (const l of looks) {
  const r = { ...l, notChecked: null, slots: [], families: [] }
  if (l.designErr)          r.notChecked = `design.json unreadable — ${l.designErr}`
  else if (!l.design)       r.notChecked = 'no design.json'
  else if (!l.entry)        r.notChecked = 'look directory is not registered in index.json — scene unknown'
  else if (!l.scene)        r.notChecked = 'index.json entry carries no scene binding'
  else if (!bakes.has(l.scene)) r.notChecked = `scene "${l.scene}" has no public/baked/<scene>/shape.json`
  else if (bakes.get(l.scene).broken) r.notChecked = `own bake unreadable — ${bakes.get(l.scene).broken}`
  if (r.notChecked) { results.push(r); continue }

  const own = bakes.get(l.scene)
  const bc = l.design.blockCustoms
  if (bc != null && (typeof bc !== 'object' || Array.isArray(bc))) {
    r.slots.push({ key: '<blockCustoms>', verdict: 'UNCLASSIFIABLE', why: `blockCustoms is ${Array.isArray(bc) ? 'an array' : typeof bc}, expected an object map` })
  } else for (const skelId in (bc || {})) {
    const bySide = bc[skelId]
    if (typeof bySide !== 'object' || bySide === null) {
      r.slots.push({ key: skelId, verdict: 'UNCLASSIFIABLE', why: `blockCustoms["${skelId}"] is not a side map` }); continue
    }
    for (const side in bySide) {
      const byOrd = bySide[side]
      if (typeof byOrd !== 'object' || byOrd === null) {
        r.slots.push({ key: `${skelId}|${side}`, verdict: 'UNCLASSIFIABLE', why: 'not a segOrd map' }); continue
      }
      for (const segOrd in byOrd) {
        const c = classifySlot(skelId, side, segOrd, own)
        r.slots.push({ key: c.triple, skelId, ...c, fields: Object.keys(byOrd[segOrd] || {}) })
      }
    }
  }
  results.push(r)
}

// ── pass 2: every other scene-keyed map in the design ───────────────────────
// Walk the whole design; for each object key, split on the separators the key
// grammars use and ask whether a token is a street name some bake knows. No
// per-field grammar, so a field added tomorrow is covered without an edit here.
const SEP = /[|:,]/
const sweep = (node, path, out, own, seen = new Set()) => {
  if (!node || typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) { for (const v of node) sweep(v, path, out, own, seen); return }
  for (const k in node) {
    for (const tok of String(k).split(SEP)) {
      const t = tok.trim()
      if (!t || !allStreets.has(t)) continue
      const here = own.streets.has(t)
      const elsewhere = [...bakes.values()].filter(b => b.scene !== own.scene && b.streets?.has(t)).map(b => b.scene)
      const fam = path[0] || '(root)'
      out.push({ family: fam, key: k, street: t, verdict: here ? 'RESOLVED' : 'BLED', foreign: elsewhere })
    }
    sweep(node[k], [...path, k], out, own, seen)
  }
}
for (const r of results) {
  if (r.notChecked) continue
  const own = bakes.get(r.scene)
  const out = []
  for (const fam in r.design) {
    if (fam === 'blockCustoms') continue                    // pass 1 owns it, exactly
    sweep(r.design[fam], [fam], out, own)
  }
  r.families = out
}

// ── report ──────────────────────────────────────────────────────────────────
const B = (s) => `\x1b[1m${s}\x1b[0m`
const pad = (s, n) => String(s).padEnd(n)
console.log(B('\nOVERRIDE PROVENANCE — whose town does each authored key belong to?'))
console.log(`bakes read: ${[...bakes.keys()].join(', ')}`)
console.log(`looks read: ${results.map(r => r.id).join(', ')}\n`)

let anyBled = 0, anyStale = 0, anyResolved = 0, anyUnclass = 0, notChecked = 0

console.log(B('── pass 1 · blockCustoms slots ' + '─'.repeat(46)))
console.log(pad('look', 26) + pad('scene', 26) + pad('slots', 7) + pad('✅ RES', 8) + pad('⛔ BLED', 9) + pad('⚠️ STALE', 10) + '⛔ UNCL')
for (const r of results) {
  if (r.notChecked) {
    console.log(`${pad(r.id, 26)}${pad(r.scene || '?', 26)}⛔ NOT CHECKED — ${r.notChecked}`)
    notChecked++
    continue
  }
  const n = (v) => r.slots.filter(s => s.verdict === v).length
  const res = n('RESOLVED'), bled = n('BLED'), stale = n('STALE'), unc = n('UNCLASSIFIABLE')
  anyResolved += res; anyBled += bled; anyStale += stale; anyUnclass += unc
  console.log(`${pad(r.id, 26)}${pad(r.scene, 26)}${pad(r.slots.length, 7)}${pad(res, 8)}${pad(bled, 9)}${pad(stale, 10)}${unc}`)
}

console.log(B('\n── pass 1 · evidence, per street ' + '─'.repeat(44)))
for (const r of results) {
  if (r.notChecked || !r.slots.length) continue
  const bad = r.slots.filter(s => s.verdict !== 'RESOLVED')
  console.log(`\n${B(r.id)}  (scene ${r.scene}, bake ${bakes.get(r.scene).tiles} tiles, ${bakes.get(r.scene).streets.size} streets)`)
  if (!bad.length) { console.log('  ✅ every slot resolves against its own bake.'); continue }
  const byStreet = new Map()
  for (const s of bad) {
    const k = `${s.skelId} ${s.verdict} ${s.why || ''} ${(s.foreign || []).join(',')} ${s.ambiguous ? 'A' : ''}${s.nameOnly ? 'N' : ''}`
    if (!byStreet.has(k)) byStreet.set(k, { ...s, n: 0 })
    byStreet.get(k).n++
  }
  for (const s of byStreet.values()) {
    const mark = s.verdict === 'BLED' ? '⛔ BLED ' : s.verdict === 'STALE' ? '⚠️ STALE' : '⛔ UNCL '
    let tail = ''
    if (s.verdict === 'BLED') tail = `→ belongs to: ${B(s.foreign.join(', '))}${s.nameOnly ? '  (street matches there; this side/segOrd does not — still a foreign street)' : ''}`
    if (s.verdict === 'STALE') tail = `— ${s.why}${s.ambiguous ? `  ⚠️ AMBIGUOUS: this exact triple also exists in ${s.foreign.join(', ')}` : ''}`
    if (s.verdict === 'UNCLASSIFIABLE') tail = `— ${s.why}`
    console.log(`  ${mark} ${pad(s.skelId || s.key, 30)} ×${pad(s.n, 4)} ${tail}`)
  }
}

if (SLOTS) {
  console.log(B('\n── pass 1 · every slot ' + '─'.repeat(54)))
  for (const r of results) {
    if (r.notChecked) continue
    for (const s of r.slots) console.log(`  ${pad(r.id, 24)} ${pad(s.verdict, 15)} ${pad(s.key, 40)} ${(s.fields || []).join(',')}`)
  }
}

console.log(B('\n── pass 2 · every OTHER scene-keyed map in the design ' + '─'.repeat(24)))
console.log('(street names parsed out of object keys anywhere in design.json — no per-field grammar)')
let fam2 = 0
for (const r of results) {
  if (r.notChecked) { console.log(`  ${pad(r.id, 26)}⛔ NOT CHECKED — ${r.notChecked}`); continue }
  const bled = r.families.filter(f => f.verdict === 'BLED')
  const res  = r.families.filter(f => f.verdict === 'RESOLVED')
  fam2 += bled.length
  if (!r.families.length) { console.log(`  ${pad(r.id, 26)}— no street-keyed data outside blockCustoms`); continue }
  console.log(`  ${pad(r.id, 26)}✅ ${res.length} own-street key refs, ⛔ ${bled.length} foreign`)
  for (const f of bled) console.log(`      ⛔ ${pad(f.family, 30)} "${f.key}"  street ${B(f.street)} → ${f.foreign.join(', ')}`)
}

console.log(B('\n── verdict ' + '─'.repeat(66)))
console.log(`  ✅ RESOLVED       ${anyResolved}`)
console.log(`  ⛔ BLED           ${anyBled}   ${anyBled ? '← one town\'s authoring inside another town\'s file' : ''}`)
console.log(`  ⚠️ STALE          ${anyStale}`)
console.log(`  ⛔ UNCLASSIFIABLE ${anyUnclass}`)
console.log(`  ⛔ NOT CHECKED    ${notChecked} look(s)`)
console.log(`  ⛔ pass-2 foreign ${fam2}`)
console.log('\n⛔ Nothing was written, deleted or "cleaned". Removing authoring is the operator\'s call.\n')
process.exit(anyBled || anyUnclass ? 1 : 0)
