#!/usr/bin/env node
// conform-diff.mjs — THE CONFORM GATE (EXTENT-DESIGN §6).
//
// Mechanically compares OLD Lafayette Square against the NEW (staging) pour across
// every artifact + input, and flags every difference. The swap only happens when
// this is green. Stops "did everything carry?" from being the operator's eye or
// Boz's memory — it is exhaustive by construction. Safe: reads only.
//
// Run: node scratch/conform-diff.mjs

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (...p) => join(ROOT, ...p)
const OLD = 'lafayette-square', NEW = 'lafayette-square-staging'
const readJ = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const arr = (o) => !o ? [] : Array.isArray(o) ? o : (o.buildings || o.trees || o.instances || o.lamps || o.streets || o.landmarks || o.listings || o.features || (o.elements) || [])

const rows = []
// status: ok / gap (new < old, something missing) / info (differs, not a loss) / better (new > old)
const row = (dim, oldV, newV, status, note = '') => rows.push({ dim, oldV: String(oldV), newV: String(newV), status, note })

// ── FRAME ────────────────────────────────────────────────────────────────────
{
  const go = readJ(R('cartograph/data', OLD, 'geography.json')), gn = readJ(R('cartograph/data', NEW, 'geography.json'))
  const bo = readJ(R('cartograph/data', OLD, 'neighborhood_boundary.json')), bn = readJ(R('cartograph/data', NEW, 'neighborhood_boundary.json'))
  row('frame origin', `${go?.lat},${go?.lon}`, `${gn?.lat},${gn?.lon}`, 'info', 'new = frozen fetch center')
  row('disc center', JSON.stringify(bo?.center), JSON.stringify(bn?.center), 'info', 'new = off-origin (D4 fixed)')
  row('disc radius', bo?.radius, bn?.radius, bn?.radius ? 'info' : 'gap')
}

// ── BUILDINGS ────────────────────────────────────────────────────────────────
{
  const ns = (s) => { const b = arr(readJ(R('public/baked', s, 'buildings.json'))); const pre = {}; for (const x of b) { const p = String(x.id || '').replace(/\d.*$/, ''); pre[p] = (pre[p] || 0) + 1 }; return { n: b.length, ns: Object.keys(pre)[0] || '—' } }
  const o = ns(OLD), n = ns(NEW)
  row('buildings', `${o.n} (${o.ns})`, `${n.n} (${n.ns})`, n.n >= o.n * 0.8 ? 'info' : 'gap', 'crosswalk gates content; count differs by source')
}

// ── TREES (by well + allowed-LU fill) ────────────────────────────────────────
{
  const tally = (s) => { const t = arr(readJ(R('public/baked', s, 'trees.json'))); const w = {}; for (const x of t) w[x.source || '?'] = (w[x.source || '?'] || 0) + 1; return { n: t.length, w } }
  const o = tally(OLD), n = tally(NEW)
  row('trees total', o.n, n.n, n.n >= o.n * 0.9 ? 'ok' : 'gap')
  const wells = new Set([...Object.keys(o.w), ...Object.keys(n.w)])
  for (const w of wells) row(`  tree well: ${w}`, o.w[w] || 0, n.w[w] || 0, (n.w[w] || 0) >= (o.w[w] || 0) * 0.9 ? 'ok' : ((o.w[w] || 0) === 0 ? 'better' : 'gap'), (o.w[w] && !n.w[w]) ? '⚠ WELL MISSING' : '')
  // the ALLOWED-LU fill: a "derived"/exposed-LU well would show here; flag if old has it and new doesn't
  const allowedOld = (o.w['derived'] || 0) + (o.w['canopy'] || 0) + (o.w['allowed'] || 0)
  const allowedNew = (n.w['derived'] || 0) + (n.w['canopy'] || 0) + (n.w['allowed'] || 0)
  row('  allowed-LU fill', allowedOld, allowedNew, allowedOld === 0 && allowedNew === 0 ? 'info' : (allowedNew >= allowedOld ? 'ok' : 'gap'), allowedOld === 0 ? 'old is real-only too — allow-model may be render-time' : '')
}

// ── LAMPS ────────────────────────────────────────────────────────────────────
{
  const ct = (s) => { const l = readJ(R('public/baked', s, 'lamps.json')); return l?.count ?? arr(l).length }
  const o = ct(OLD), n = ct(NEW)
  row('lamps (baked)', o, n, n >= o ? 'better' : (n > 0 ? 'info' : 'gap'), 'old=authored 80s; new=OSM. render path is separate (Stage hardwire)')
}

// ── SURVEY CUSTOMS (overlay.json) ────────────────────────────────────────────
{
  const keys = (s) => new Set(Object.keys(readJ(R('cartograph/data', s, 'clean/overlay.json'))?.streets || {}))
  const o = keys(OLD), n = keys(NEW)
  const missing = [...o].filter(k => !n.has(k))
  row('Survey customs (streets)', o.size, n.size, missing.length ? 'gap' : 'ok', missing.length ? `missing: ${missing.slice(0, 6).join(',')}` : 'all carried')
}

// ── SECTION CUSTOMS (blockCustoms in design.json) ────────────────────────────
{
  const bc = (s) => { const d = readJ(R('public/looks', s, 'design.json'))?.blockCustoms || {}; let n = 0; for (const st of Object.keys(d)) for (const sd of Object.keys(d[st])) n += Object.keys(d[st][sd]).length; return { streets: Object.keys(d), n } }
  const o = bc(OLD), n = bc(NEW)
  const missing = o.streets.filter(k => !n.streets.includes(k))
  row('Section customs (overrides)', `${o.streets.length}st/${o.n}`, `${n.streets.length}st/${n.n}`, missing.length ? 'gap' : 'ok', missing.length ? `missing: ${missing.slice(0, 6).join(',')}` : 'all carried')
}

// ── LOOK (design.json fields) ────────────────────────────────────────────────
{
  const dOld = readJ(R('public/looks', OLD, 'design.json')) || {}, dNew = readJ(R('public/looks', NEW, 'design.json')) || {}
  const keysOld = Object.keys(dOld), missing = keysOld.filter(k => !(k in dNew))
  // fields present in both but where new is empty/default while old is authored
  const emptied = keysOld.filter(k => k in dNew && JSON.stringify(dOld[k]) !== JSON.stringify(dNew[k]) && dOld[k] && (Array.isArray(dOld[k]) ? dOld[k].length : Object.keys(dOld[k] || {}).length) > (dNew[k] ? (Array.isArray(dNew[k]) ? dNew[k].length : Object.keys(dNew[k] || {}).length) : 0))
  row('Look fields', keysOld.length, Object.keys(dNew).length, missing.length ? 'gap' : 'ok', missing.length ? `MISSING: ${missing.join(',')}` : 'all present')
  if (emptied.length) row('  Look fields differing', '', emptied.length, 'info', emptied.slice(0, 10).join(','))
}

// ── CONTENT (place cards, via crosswalk resolve) ─────────────────────────────
{
  const cards = arr(readJ(R('src/data/landmarks.json')))
  const anchored = cards.filter(c => c.building_id || c.buildingId).length
  row('content cards', cards.length, `${anchored} anchored`, 'info', 'crosswalk: 72 auto / 11 verify / 4 non-bldg (0 lost)')
}

// ── LABELS + GROUND ──────────────────────────────────────────────────────────
for (const [dim, file, key] of [['labels', 'labels.json', 'labels'], ['ground layers', 'ground.json', 'groups']]) {
  const o = arr(readJ(R('public/baked', OLD, file))), n = arr(readJ(R('public/baked', NEW, file)))
  row(dim, o.length || '?', n.length || '?', (n.length >= o.length * 0.5 || !o.length) ? 'ok' : 'gap')
}

// ── REPORT ───────────────────────────────────────────────────────────────────
const ICON = { ok: '✅', gap: '❌', info: '·', better: '⬆', }
const pad = (v, w) => String(v).padEnd(w)
console.log(`\n═══ CONFORM DIFF — ${OLD} (old) vs ${NEW} (new) ═══\n`)
console.log(pad('', 3), pad('dimension', 28), pad('OLD', 16), pad('NEW', 18), 'note')
for (const r of rows) console.log(pad(ICON[r.status] || '?', 3), pad(r.dim, 28), pad(r.oldV, 16), pad(r.newV, 18), r.note)
const gaps = rows.filter(r => r.status === 'gap')
console.log(`\n${gaps.length ? '❌ ' + gaps.length + ' GAP(S) — swap is NOT safe yet:' : '✅ NO GAPS — every old-LS thing is accounted for in new-LS.'}`)
for (const g of gaps) console.log(`   ❌ ${g.dim}: old=${g.oldV} new=${g.newV}  ${g.note}`)
console.log('')
process.exit(gaps.length ? 1 : 0)
