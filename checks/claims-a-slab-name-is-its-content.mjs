#!/usr/bin/env node
/**
 * "IS A PUBLISHED SLAB FILE NAMED BY ITS CONTENT — AND DOES THE UPLOADER WRITE WHAT THE PLAYER ASKS FOR?"
 *
 * WHY (BRIEF-slab-loading §3 step 3, 2026-09-28). The player (src/lib/slabUrl.js) and the uploader
 * (scripts/upload-baked-to-r2.mjs) must agree on one name per file, or a published town 404s. Both
 * read src/lib/slabNames.js; this check proves the rule and proves the uploader's plan against it,
 * on a fixture town built in a temp dir (no network, no R2).
 *
 * Asserts:
 *   · contentName: `<dir>/<name>.<sha256[0..16]>.<ext>`, the last extension kept;
 *   · shaOf reads files / content / photos, and a name the manifest does not record THROWS;
 *   · refRel takes the three cross-reference spellings, and refuses another look's slab;
 *   · slabPath: remote + HASHED → content name, never a query; remote + plain → plain, never a
 *     query; on disk → plain, plus `?bake=` only when a re-read key is given;
 *   · the uploader's plan WITHOUT --names=hashed is today's plan (plain keys, the 300 s header);
 *   · WITH it: every published file twice (plain 300 s + content name immutable), the rule's
 *     exclusions in neither, then a versioned manifest copy, then the index, and manifest.json
 *     LAST, no-cache, stamped `names: HASHED`;
 *   · a manifest that disagrees with the files on disk, or no manifest, REFUSES the hashed plan;
 *   · the retirement sweep (scripts/sweep-retired-slab-keys.mjs) keeps the last K ≥ 2 manifests,
 *     never retires a name a kept manifest uses, retires the older copies, and refuses K < 2 and
 *     any plain key unless asked.
 *
 * ⛔ READ-ONLY (writes only a temp dir). Usage: node checks/claims-a-slab-name-is-its-content.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { HASHED, CACHE, contentName, shaOf, refRel, slabPath, manifestPath } from '../src/lib/slabNames.js'

const fails = []
const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
const throws = (what, fn) => { try { fn(); fails.push(`${what}: did not throw`) } catch { /* expected */ } }
const sha = (b) => createHash('sha256').update(b).digest('hex')

// ── the naming rule ─────────────────────────────────────────────────────────────────
const S = 'ab'.repeat(32)
eq('contentName flat', contentName('ground.json', S), `ground.${S.slice(0, 16)}.json`)
eq('contentName dotted', contentName('trees/oak/a.albedo.ktx2', S), `trees/oak/a.albedo.${S.slice(0, 16)}.ktx2`)
throws('contentName without extension', () => contentName('trees/README', S))
throws('contentName bad sha', () => contentName('a.json', 'nope'))

const M = { town: 'fx', files: { 'ground.json': { sha256: S } }, content: { 'listings.json': { sha256: 'cd'.repeat(32) }, 'menus.json': null },
  photos: { 'photos/a/01.jpg': { path: 'content/photos/a/01.jpg', sha256: 'ef'.repeat(32) } } }
eq('shaOf files', shaOf(M, 'ground.json'), S)
eq('shaOf content', shaOf(M, 'content/listings.json'), 'cd'.repeat(32))
eq('shaOf photo', shaOf(M, 'content/photos/a/01.jpg'), 'ef'.repeat(32))
throws('shaOf unrecorded', () => shaOf(M, 'terrain.bin'))
throws('shaOf null content', () => shaOf(M, 'content/menus.json'))

eq('refRel bare', refRel('fx', 'ground.bin'), 'ground.bin')
eq('refRel look-root', refRel('fx', '/trees/oak/s-1-lod1.glb'), 'trees/oak/s-1-lod1.glb')
eq('refRel absolute', refRel('fx', '/baked/fx/trees-atlas-color.png'), 'trees-atlas-color.png')
throws('refRel another look', () => refRel('fx', '/baked/other/trees-atlas-color.png'))
throws('refRel url', () => refRel('fx', 'https://x/y.png'))

eq('slabPath remote hashed', slabPath('fx', 'ground.json', { remote: true, manifest: M, hashed: true, reread: 5 }), `baked/fx/ground.${S.slice(0, 16)}.json`)
eq('slabPath remote plain', slabPath('fx', 'ground.json', { remote: true, manifest: M, hashed: false, reread: 5 }), 'baked/fx/ground.json')
eq('slabPath disk + reread', slabPath('fx', 'ground.json', { remote: false, reread: 5 }), 'baked/fx/ground.json?bake=5')
eq('slabPath disk', slabPath('fx', 'ground.json', { remote: false }), 'baked/fx/ground.json')
eq('slabPath disk ignores hashed', slabPath('fx', 'ground.json', { remote: false, manifest: M, hashed: true }), 'baked/fx/ground.json')
throws('slabPath remote hashed unrecorded', () => slabPath('fx', 'terrain.bin', { remote: true, manifest: M, hashed: true }))
throws('slabPath query in rel', () => slabPath('fx', 'ground.json?t=1', { remote: false }))
throws('slabPath no look', () => slabPath(null, 'ground.json', { remote: false }))
eq('manifestPath', manifestPath('fx'), 'baked/fx/manifest.json')

// ── the uploader's plan, on a fixture town ─────────────────────────────────────────
let up
try { up = await import('../scripts/upload-baked-to-r2.mjs') } catch (e) { fails.push(`the uploader cannot be imported without running: ${e.message}`) }
if (up && typeof up.plan !== 'function') { fails.push('the uploader exports no plan()'); up = null }

if (up) {
  const root = mkdtempSync(join(tmpdir(), 'slab-names-'))
  try {
    const town = join(root, 'fx')
    const put = (rel, body) => { mkdirSync(join(town, rel, '..'), { recursive: true }); writeFileSync(join(town, rel), body); return body }
    const bodies = {
      'ground.json': put('ground.json', '{"bin":"ground.bin"}'),
      'ground.bin': put('ground.bin', 'BIN'),
      'trees/oak/s-1-lod1.glb': put('trees/oak/s-1-lod1.glb', 'GLB1'),
      'trees/oak/s-1-lod0.glb': put('trees/oak/s-1-lod0.glb', 'GLB0'),        // excluded by rule
      'content/listings.json': put('content/listings.json', '[]'),
    }
    const files = Object.fromEntries(['ground.json', 'ground.bin', 'trees/oak/s-1-lod1.glb', 'trees/oak/s-1-lod0.glb']
      .map(r => [r, { bytes: bodies[r].length, sha256: sha(bodies[r]) }]))
    const manifest = { version: 0, town: 'fx', writtenAt: '2026-09-28T00:00:00Z', files,
      content: { 'listings.json': { bytes: 2, sha256: sha('[]') }, 'menus.json': null }, photos: {} }
    writeFileSync(join(town, 'manifest.json'), JSON.stringify(manifest))

    const plain = up.plan({ look: 'fx', prefix: 'staging/', root })
    eq('plain plan keys', plain.files.map(f => f.key).sort(),
      ['staging/baked/fx/content/listings.json', 'staging/baked/fx/ground.bin', 'staging/baked/fx/ground.json',
        'staging/baked/fx/manifest.json', 'staging/baked/fx/trees/oak/s-1-lod1.glb'])
    eq('plain plan headers', [...new Set(plain.files.map(f => f.cache))], [CACHE.plain])

    const h = up.plan({ look: 'fx', prefix: 'staging/', root, names: HASHED })
    const keys = h.files.map(f => f.key)
    for (const rel of ['ground.json', 'ground.bin', 'trees/oak/s-1-lod1.glb', 'content/listings.json']) {
      const hk = 'staging/baked/fx/' + contentName(rel, sha(bodies[rel]))
      const pk = 'staging/baked/fx/' + rel
      const hf = h.files.find(f => f.key === hk), pf = h.files.find(f => f.key === pk)
      if (!hf) fails.push(`hashed plan has no ${hk}`); else eq(`${hk} header`, hf.cache, CACHE.hashed)
      if (!pf) fails.push(`hashed plan dropped the plain ${pk} (dual-write)`); else eq(`${pk} header`, pf.cache, CACHE.plain)
    }
    if (keys.some(k => /lod0/.test(k))) fails.push('hashed plan publishes an excluded lod0')
    const last = h.files[h.files.length - 1]
    eq('hashed plan ends with the manifest', last?.key, 'staging/baked/fx/manifest.json')
    eq('manifest header', last?.cache, CACHE.manifest)
    if (last) eq('published manifest is stamped', JSON.parse(readFileSync(last.abs, 'utf8')).names, HASHED)
    const iCopy = keys.findIndex(k => /^staging\/baked\/fx\/manifests\/[0-9a-f]{16}\.json$/.test(k))
    const iIndex = keys.indexOf('staging/baked/fx/manifests/index.json')
    if (iCopy < 0) fails.push('hashed plan writes no versioned manifest copy (the sweep keeps the last K of them)')
    else eq('versioned copy header', h.files[iCopy].cache, CACHE.hashed)
    if (iIndex < 0) fails.push('hashed plan writes no manifests/index.json')
    else eq('index header', h.files[iIndex].cache, CACHE.manifest)
    if (!(iCopy >= 0 && iIndex > iCopy && iIndex < h.files.length - 1)) fails.push(`order: copy ${iCopy} → index ${iIndex} → manifest ${h.files.length - 1}`)
    const firstPlainOrManifest = h.files.findIndex(f => f.cache !== CACHE.hashed)
    const lastHashedPayload = h.files.map(f => f.cache === CACHE.hashed && !/\/manifests\//.test(f.key)).lastIndexOf(true)
    if (lastHashedPayload > firstPlainOrManifest) fails.push('a content-named file is written after a plain one — the hashed set must be complete before anything points at it')

    writeFileSync(join(town, 'ground.bin'), 'CHANGED')
    throws('hashed plan with a stale manifest', () => up.plan({ look: 'fx', prefix: 'staging/', root, names: HASHED }))
    rmSync(join(town, 'manifest.json'))
    throws('hashed plan with no manifest', () => up.plan({ look: 'fx', prefix: 'staging/', root, names: HASHED }))
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ── the retirement sweep's plan ──────────────────────────────────────────────────────
let sw
try { sw = await import('../scripts/sweep-retired-slab-keys.mjs') } catch (e) { fails.push(`the sweep cannot be imported without running: ${e.message}`) }
if (sw && typeof sw.retirePlan !== 'function') { fails.push('the sweep exports no retirePlan()'); sw = null }
if (sw) {
  const base = 'baked/fx/'
  const m = (g, b) => ({ town: 'fx', names: HASHED, files: { 'ground.json': { sha256: g }, 'ground.bin': { sha256: b } }, content: {}, photos: {} })
  const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64), D = 'd'.repeat(64)
  const index = { town: 'fx', manifests: [{ key: base + 'manifests/1111111111111111.json' }, { key: base + 'manifests/2222222222222222.json' }, { key: base + 'manifests/3333333333333333.json' }] }
  const manifests = { [index.manifests[0].key]: m(A, B), [index.manifests[1].key]: m(C, B), [index.manifests[2].key]: m(D, B) }
  const p = sw.retirePlan({ base, index, manifests, keep: 2 })
  eq('sweep retires the oldest-only names', p.retire.sort(), [base + contentName('ground.json', A), index.manifests[0].key].sort())
  eq('sweep keeps the last 2 in the index', p.index.manifests.map(x => x.key), index.manifests.slice(1).map(x => x.key))
  if (p.retire.includes(base + contentName('ground.bin', B))) fails.push('sweep retires a name a kept manifest still uses')
  if (p.retire.some(k => !k.startsWith(base) || /\/manifest\.json$|index\.json$/.test(k))) fails.push('sweep retires the switch or a key outside the town')
  throws('sweep keep < 2', () => sw.retirePlan({ base, index, manifests, keep: 1 }))
  eq('sweep retires no plain key unasked', p.retire.filter(k => /ground\.(json|bin)$/.test(k)), [])
  const pp = sw.retirePlan({ base, index, manifests, keep: 2, retirePlain: true })
  eq('sweep --retire-plain adds the plain names', pp.retire.filter(k => /ground\.(json|bin)$/.test(k)).sort(), [base + 'ground.bin', base + 'ground.json'])
  throws('sweep with a missing kept manifest', () => sw.retirePlan({ base, index, manifests: { [index.manifests[0].key]: m(A, B) }, keep: 2 }))
}

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ a published slab file is named by its content, and the uploader writes exactly those names')
