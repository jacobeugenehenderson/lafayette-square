#!/usr/bin/env node
/**
 * "IS THERE ONE WAY INTO STAGE?" — Jacob, 2026-10-04: "this shouldn't be baking if it's not dirty, and it shouldn't open
 * in Stage without a note if it's dirty."
 *
 * Every way in (the Designer's Stage → button, a `/stage/<town>/<shot>` path, a `?scene=&look=&shot=` link, a reload)
 * reaches Stage the same way: the address is read by `src/lib/authoringAddress.js#readAddress`, nothing bakes, and the
 * slab's age is asked of the bake's one plan (`_measureSlabAge` → GET /looks/<id>/bake), whose alarm offers the Bake.
 * And the plan does not cry wolf: a just-baked town is clean.
 *
 * Asserts:
 *   1. Stage → navigates and never bakes; runBake has no navigation parameter left;
 *   2. entering Stage from the Designer or Extent measures the slab (setShot), as load does (_loadLooks);
 *   3. the clean path and the query form name the same town and shot: parseStagePath ∘ stagePath round-trips every
 *      town × Stage shot in the index, and addressUrl writes the clean form for a Stage shot and /cartograph otherwise;
 *   4. live: /stage/<town>/<shot> serves the SAME cartograph.html as /cartograph (one app, not a second Stage page);
 *   5. live: no town's plan names a step for the bake's own bakedAt stamp, for revetment.json on a town whose last
 *      revetment run wrote none, or for another town's record (the registry's town-id.json / modules).
 *
 * ⭐ Reads the source and asks the running dev server; it never bakes and writes nothing.
 *   node checks/claims-one-way-into-stage.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.KIT_ROOT || join(import.meta.dirname, '..')   // KIT_ROOT: a scratch copy, for mutation tests
const BASE = 'http://localhost:5173'
const src = (p) => readFileSync(join(ROOT, p), 'utf8')
let failed = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const body = (text, start) => { const i = text.indexOf(start); if (i < 0) return null; let d = 0; for (let j = text.indexOf('{', i); j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}' && --d === 0) return text.slice(i, j + 1) } return null }
console.log('\nOne way into Stage')

// ── 1 ─────────────────────────────────────────────────────────────────────────
const toolbar = src('src/cartograph/Toolbar.jsx')
const btn = toolbar.slice(toolbar.indexOf('className="carto-stage-btn"'), toolbar.indexOf('</button>', toolbar.indexOf('className="carto-stage-btn"')))
if (!btn) bad('Toolbar.jsx has no carto-stage-btn — the Stage → button moved; this cannot check it')
else if (/runBake\(/.test(btn)) bad('Stage → still calls runBake — entering Stage bakes')
else if (!/setShot\('hero'\)/.test(btn)) bad('Stage → does not navigate with setShot(\'hero\')')
else ok('Stage → navigates (setShot) and never bakes')
const store = src('src/cartograph/stores/useCartographStore.js')
if (/navigateTo/.test(store)) bad('useCartographStore still carries runBake\'s navigateTo — a bake that navigates is a second way in')
else ok('runBake navigates nowhere')

// ── 2 ─────────────────────────────────────────────────────────────────────────
const setShot = body(store, '  setShot: (shot) => {')
if (!setShot) bad('no setShot in the store')
else if (!/isStageShot\(shot\)\s*&&\s*!isStageShot\(get\(\)\.shot\)/.test(setShot) || !/_measureSlabAge\(\)/.test(setShot)) bad('setShot does not measure the slab when it enters Stage')
else ok('entering Stage measures the slab (setShot), as load does')
if (!/_measureSlabAge\(\)/.test(body(store, '  _loadLooks:') || '')) bad('_loadLooks does not measure the slab — a reload or a link would enter Stage unmeasured')

// ── 3 ─────────────────────────────────────────────────────────────────────────
const A = await import(join(ROOT, 'src/lib/authoringAddress.js'))
const looks = JSON.parse(src('public/looks/index.json')).looks || []
const towns = [...new Set(looks.map(l => l.scene).filter(Boolean))]
const STAGE = ['browse', 'hero', 'street']
let trips = 0
for (const scene of towns) for (const shot of STAGE) {
  const lookId = A.lookForScene(looks, scene, null)
  const p = A.parseStagePath(A.stagePath(looks, { scene, lookId, shot }).split('?')[0])
  if (p?.scene !== scene || p?.shot !== shot) bad(`/stage round-trip lost ${scene}/${shot}: got ${JSON.stringify(p)}`)
  else trips++
}
const planted = A.parseStagePath('/stage/huron/browse')
if (planted?.scene !== 'huron' || planted?.shot !== 'browse') bad('parseStagePath does not read a planted /stage/huron/browse — the round-trip above means nothing')
else ok(`/stage/<town>/<shot> round-trips ${trips} town × shot pairs; a bare /stage/<town> opens on ${A.parseStagePath('/stage/huron').shot}`)
const stageUrl = A.addressUrl('http://x/cartograph?scene=huron&debug=1', looks, { scene: 'huron', lookId: A.lookForScene(looks, 'huron', null), shot: 'browse', stage: true })
const designerUrl = A.addressUrl('http://x/stage/huron/browse?debug=1', looks, { scene: 'huron', lookId: A.lookForScene(looks, 'huron', null), shot: 'designer', stage: false })
if (stageUrl.pathname !== '/stage/huron/browse' || stageUrl.searchParams.get('scene') || stageUrl.searchParams.get('debug') !== '1') bad(`addressUrl for a Stage shot wrote ${stageUrl.href}`)
else if (designerUrl.pathname !== '/cartograph' || designerUrl.searchParams.get('shot') !== 'designer') bad(`addressUrl for the Designer wrote ${designerUrl.href}`)
else ok('the app writes /stage/<town>/<shot> for a Stage shot and /cartograph?… otherwise, keeping other flags')
const app = src('src/cartograph/CartographApp.jsx')
if ((app.match(/addressUrl\(/g) || []).length < 2 || /searchParams\.set\('scene'/.test(app)) bad('CartographApp writes the address without authoringAddress.js#addressUrl (both the effect and the town-switch reload must)')

// ── 4 ─────────────────────────────────────────────────────────────────────────
let live = true
try {
  const one = await (await fetch(`${BASE}/cartograph`)).text()
  for (const p of [`/stage/${towns[0]}/hero`, `/stage/${towns[0]}`]) {
    const r = await fetch(`${BASE}${p}`); const t = await r.text()
    if (!r.ok || t !== one) bad(`${p} does not serve the same page as /cartograph (${r.status})`)
  }
  if (!/ward-authoring/.test(one)) bad('/cartograph is not the authoring page')
  if (!failed) ok('/stage/<town>[/<shot>] serves the same cartograph.html as /cartograph')
} catch (e) { live = false; console.log(`  · NOT MEASURED (live) — the kit at :5173 did not answer (${e.message})`) }

// ── 5 ─────────────────────────────────────────────────────────────────────────
if (live) {
  const WOLF = [
    [/^public\/baked\/[^ ]+\/scene\.json$/, 'the bake\'s own bakedAt stamp (scene.json read by file)'],
    [/revetment\.json missing$/, 'a revetment the town never had'],
    [/^cartograph\/data\/[^/]+\/town-id\.json$|^src\/instances\/(?!registry)[^ ]+\.js$/, 'another town\'s record'],
  ]
  // A planted reason must trip the filter before its silence means anything.
  if (!WOLF.some(([re]) => re.test('public/baked/huron/scene.json'))) bad('the false-alarm filter does not catch a planted scene.json reason')
  let seen = 0, wolves = 0
  for (const l of looks.filter(x => x.scene)) {
    const r = await fetch(`${BASE}/api/cartograph/looks/${l.id}/bake`)
    if (r.status === 409) { console.log(`  · ${l.id}: baking — not measured`); continue }
    const b = await r.json().catch(() => ({}))
    if (!r.ok) { bad(`${l.id}: the plan did not answer (${r.status} ${b.error || ''})`); continue }
    seen++
    // ⭐ A step with NO record has never run under this bake; "missing" is then the truth, not a false alarm.
    for (const s of b.stale || []) {
      if ((s.why || []).some(w => /\(no record of what/.test(w))) continue
      for (const w of s.why || []) for (const [re, what] of WOLF) if (re.test(w)) { wolves++; bad(`${l.id}: "${s.step}" is stale for ${what}: ${w}`) }
    }
  }
  if (seen && !wolves) ok(`${seen} towns' plans: no step stale for the bake's own stamp, an absent revetment, or another town's record`)
}

console.log(failed ? `\n⛔ ${failed} failed\n` : '\nall held\n')
process.exit(failed ? 1 : 0)
