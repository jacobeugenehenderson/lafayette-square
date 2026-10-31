#!/usr/bin/env node
/**
 * "DOES THE BAKE CARRY A TOWN'S DISPLAYS, SO PREVIEW AND THE PLAYER SHOW WHAT STAGE SHOWS?" (Tinsel's measurement,
 * 2026-10-31: the published manifest had no displays, so Preview and the player drew none; plan approved by Boz, Zob's
 * premises and changes; Boz's ruling: Stage reads the AUTHORING drawer, Preview and the player the PUBLISHED one.)
 *
 *   1. bake-manifest.mjs's displays step (run on a planted drawer in the OS temp dir, removed after): every frame the
 *      drawer's looks.json names is published beside the content and indexed { drawer, files }; a frame left from an
 *      earlier bake is GONE (the output dir is emptied first); a missing frame or drawer exits 2, by name; photos and
 *      drawers share one copier (publishBeside);
 *   2. the slab resolver names a drawer file (slabNames#shaOf), and the retired-key sweep keeps it (namesOf);
 *   3. drawerUrl.js: 'authoring' reads the town's contentRoot; 'published' reads the manifest's block through the slab
 *      resolver and REFUSES by name when the manifest has none; any other source throws;
 *   4. LightShow loads its drawer only through drawerUrls; every <Town> and direct <SetPiece> in src names a
 *      displaySource (read from source, walking the tree); Displays refuses one that names none;
 *   5. the static build's content mirror skips displays/ (no reader of it ships in that build).
 *
 * Usage: node checks/claims-the-bake-carries-its-displays.mjs [--mutants]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importSource, sourceOf } from './_importSource.mjs'

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
function jsxFiles(dir, out = []) {
  for (const f of readdirSync(join(process.cwd(), dir))) {
    const p = `${dir}/${f}`
    if (statSync(join(process.cwd(), p)).isDirectory()) jsxFiles(p, out); else if (/\.jsx$/.test(f)) out.push(p)
  }
  return out
}

/** Run bake-manifest's displays step (and its copier) on a planted town; → { displays, out, exited } */
async function runStep(mutate, plant) {
  const root = mkdtempSync(join(tmpdir(), 'bake-displays-'))
  try {
    const contentSrc = join(root, 'src'), contentOut = join(root, 'out')
    mkdirSync(join(contentSrc, 'displays/show/looks/a'), { recursive: true })
    // an escaping frame: displays/show/ + ../../../ reaches the planted secret outside the town's content
    const frames = plant === 'escaping-frame' ? ['looks/a/0.svg', '../../../secret.txt'] : ['looks/a/0.svg', 'looks/a/1.svg']
    const looks = { frame: { w: 4, h: 3, pinH: 1, faces: 4 }, looks: [{ id: 'a', layers: [{ motion: { kind: 'still' }, frames }] }] }
    writeFileSync(join(root, 'secret.txt'), 'outside the town')   // what an escaping frame would reach
    if (plant === 'root-drawer') writeFileSync(join(contentSrc, 'looks.json'), JSON.stringify(looks))
    writeFileSync(join(contentSrc, 'displays/show/looks.json'), JSON.stringify(looks))
    writeFileSync(join(contentSrc, 'displays/show/looks/a/0.svg'), '<svg/>')
    if (plant !== 'missing-frame') writeFileSync(join(contentSrc, 'displays/show/looks/a/1.svg'), '<svg></svg>')
    mkdirSync(join(contentOut, 'displays/show/looks/old'), { recursive: true })
    writeFileSync(join(contentOut, 'displays/show/looks/old/stale.svg'), '<svg/>')   // left from an earlier bake
    writeFileSync(join(contentOut, 'listings.json'), '[]')   // a canary: the content this same run wrote, never emptied
    const drawer = plant === 'missing-drawer' ? 'displays/none/looks.json' : plant === 'root-drawer' ? 'looks.json' : 'displays/show/looks.json'
    const prefix = `const ROOT = ${JSON.stringify(root)}, town = 't', contentSrc = ${JSON.stringify(contentSrc)}, contentOut = ${JSON.stringify(contentOut)}
const identity = { displays: [{ id: 'show', drawer: ${JSON.stringify(drawer)} }] }
const process = { exit: (c) => { throw Object.assign(new Error('exit ' + c), { exitCode: c }) } }
const console = { error: () => {}, log: () => {} }
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname } from 'node:path'
import { drawerDir, frameRel } from '../src/displays/drawerPath.js'
`
    // bake-manifest's own text, from its copier through its displays step (photos run between them, and find no listings)
    let exited = null, displays = null
    try {
      const M = await importSource('cartograph/bake-manifest.mjs', { span: { from: '/** Copy one file beside the content and index it', to: '// ── board: the town' }, prefix, suffix: '\nexport { displays }', ...(mutate ? { transform: mutate } : {}) })
      displays = M.displays
    } catch (e) { exited = e.exitCode ?? String(e.message) }
    return { displays, exited, stale: existsSync(join(contentOut, 'displays/show/looks/old/stale.svg')), copied: existsSync(join(contentOut, 'displays/show/looks/a/1.svg')),
      canary: existsSync(join(contentOut, 'listings.json')), leaked: Object.keys(displays?.show?.files || {}).some(k => k.includes('..')) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

async function verdict({ step, names, sweep, url, show, files = {}, mirror, rule } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  // 1. the bake's step
  const ok = await runStep(step)
  F(ok.exited == null, `the displays step exited on a good drawer (${ok.exited})`)
  const blk = ok.displays?.show
  F(blk?.drawer === 'content/displays/show/looks.json' && ['content/displays/show/looks.json', 'content/displays/show/looks/a/0.svg', 'content/displays/show/looks/a/1.svg'].every(r => blk.files?.[r]?.sha256), `the drawer and every frame it names are not published and indexed (${JSON.stringify(blk)})`)
  F(ok.copied, 'a frame was indexed but not copied beside the content')
  F(!ok.stale, 'a frame left from an earlier bake is still published (the output dir was not emptied first)')
  F((await runStep(step, 'missing-frame')).exited === 2, 'a missing frame does not exit 2')
  F((await runStep(step, 'missing-drawer')).exited === 2, 'a missing drawer does not exit 2')
  const rootD = await runStep(step, 'root-drawer')
  F(rootD.exited === 2 && rootD.canary, `a drawer at the content root is not refused before anything is emptied (exit ${rootD.exited}, the town's content ${rootD.canary ? 'kept' : 'WIPED'})`)
  const esc = await runStep(step, 'escaping-frame')
  F(esc.exited === 2 && !esc.leaked, `a frame escaping the drawer's folder is not refused (exit ${esc.exited}${esc.leaked ? ', and a file from outside the town was published' : ''})`)
  // the same rule in the engine, so Stage refuses it too
  const E = await importSource('src/displays/lightShow/engine.js', rule ? { redirect: { 'src/displays/drawerPath.js': { transform: rule } } } : {})
  const fr = { w: 4, h: 3, pinH: 1, faces: 4 }
  F(!!(() => { try { E.validateDrawer({ frame: fr, looks: [{ id: 'a', layers: [{ motion: { kind: 'still' }, frames: ['../../x.svg'] }] }] }, 'w') } catch (e) { return /inside the drawer/.test(e.message) } })(), 'the engine (Stage) accepts a frame escaping the drawer')
  F(!!(() => { try { E.validateDrawer({ frame: fr, looks: [{ id: 'a', layers: [{ motion: { kind: 'still' }, frames: ['%2e%2e/x.svg'] }] }] }, 'w') } catch (e) { return /inside the drawer/.test(e.message) } })(), 'the engine (Stage) accepts a percent-encoded escape')
  const bm = code(sourceOf('cartograph/bake-manifest.mjs'))
  F((bm.match(/publishBeside\(/g) || []).length >= 3 && /photos\[url\] = publishBeside\(/.test(bm), 'photos and drawers do not share one copier (publishBeside)')
  F(/^\s*displays,$/m.test(bm), 'the manifest does not carry `displays`')
  // 2. the resolver and the sweep
  const N = await importSource('src/lib/slabNames.js', names ? { transform: names } : {})
  const man = { town: 't', displays: { show: { drawer: 'content/displays/show/looks.json', files: { 'content/displays/show/looks/a/0.svg': { sha256: 'a'.repeat(64) } } } } }
  let sha = null; try { sha = N.shaOf(man, 'content/displays/show/looks/a/0.svg') } catch {}
  F(sha === 'a'.repeat(64), 'the slab resolver cannot name a published drawer file')
  const SW = await importSource('scripts/sweep-retired-slab-keys.mjs', { span: { functions: ['namesOf'] }, prefix: "import { contentName } from '../src/lib/slabNames.js'\n", suffix: '\nexport { namesOf }', ...(sweep ? { transform: sweep } : {}) })
  F([...SW.namesOf(man, 'b/')].some(n => n.includes('content/displays/show/looks/a/0')), 'the retired-key sweep would delete a published drawer file')
  // 3. drawerUrl
  const D = await importSource('src/displays/drawerUrl.js', { ...(url ? { transform: url } : {}), redirect: { 'src/lib/slabUrl.js': { transform: () => 'export const slabManifest = async () => globalThis.__m; export const slabReady = async () => {}; export const slabUrl = (l, r) => `/baked/${l}/${r}`' } }, prefix: 'import.meta.env = { BASE_URL: "/" };\n' })
  const disp = { id: 'show', drawer: 'displays/show/looks.json' }
  globalThis.__m = man
  const pub = await D.drawerUrls('published', { lookId: 't', display: disp, where: 'w' }).catch(e => e)
  F(pub?.drawer === '/baked/t/content/displays/show/looks.json' && pub.frame('looks/a/0.svg') === '/baked/t/content/displays/show/looks/a/0.svg', `'published' does not read the manifest's copy through the slab resolver (${pub?.message || JSON.stringify(pub)})`)
  globalThis.__m = { displays: {} }
  const none = await D.drawerUrls('published', { lookId: 't', display: disp, where: 'w' }).then(() => null, e => e.message)
  F(/carries no drawer for display "show"/.test(none || ''), "'published' with no drawer in the manifest does not refuse by name")
  const auth = await D.drawerUrls('authoring', { lookId: 't', display: disp, contentRoot: 'content/t/', where: 'w' }).catch(e => e)
  F(auth?.drawer === '/content/t/displays/show/looks.json', `'authoring' does not read the town's own drawer (${auth?.drawer || auth?.message})`)
  F(await D.drawerUrls(undefined, { lookId: 't', display: disp, where: 'w' }).then(() => false, () => true), 'a source the app did not name is not refused')
  // 4. the reader, the mounts, the refusal
  const ls = code(show ? show(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/await drawerUrls\(source,/.test(ls) && !/BASE_URL\}\$\{contentRoot\}/.test(ls), 'LightShow does not load its drawer through drawerUrls')
  const src = (rel) => code(files[rel] ? files[rel](sourceOf(rel)) : sourceOf(rel))
  for (const rel of jsxFiles('src')) {
    if (rel === 'src/components/Town.jsx') continue
    for (const m of src(rel).matchAll(/<(Town|SetPiece)\s[^>]*?\/?>/gs)) if (!/\bdisplaySource=/.test(m[0])) fails.push(`${rel}: a <${m[1]}> names no displaySource`)
  }
  F(/drawerSource !== 'authoring' && drawerSource !== 'published' \?/.test(src('src/displays/Displays.jsx')), 'Displays does not refuse a display whose app names no drawer source')
  // 5. the build mirror
  // raw, not comment-stripped: vite.config.js carries `*/` inside glob strings, which a block-comment strip would eat across
  const vc = mirror ? mirror(sourceOf('vite.config.js')) : sourceOf('vite.config.js')
  F(/copyDir\(contentDir, path\.resolve\(outDir, 'content', look\.name\), new Set\(\['displays'\]\)\)/.test(vc), "the static build's content mirror still carries displays/")
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the bake does not carry its displays:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ the bake carries its displays: every frame published and indexed, none stale, a hole exits 2; the resolver names it and the sweep keeps it; Preview and the player read the published copy, Stage its own; every mount names its source; the build no longer mirrors drawers")

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a stale frame left published', { step: (s) => s.replace('rmSync(resolve(contentOut, dir), { recursive: true, force: true })', 'void 0') }],
    ['a drawer at the content root accepted', { step: (s) => s.replace('try { dir = drawerDir(d.drawer, where) } catch (e) { console.error(e.message); process.exit(2) }', 'dir = dirname(d.drawer)') }],
    ['a frame escaping its folder accepted', { step: (s) => s.replace('try { frameRel(frame, `${where} look "${L.id}"`) } catch (e) { console.error(e.message); process.exit(2) }', '') }],
    ['a percent-encoded escape accepted', { rule: (s) => s.replace(" && !s.includes('%')", '') }],
    ['a missing frame accepted', { step: (s) => s.replace("is not on disk`); process.exit(2) }\n    if (!files", "is not on disk`); continue }\n    if (!files") }],
    ['the resolver blind to drawers', { names: (s) => s.replace('for (const d of Object.values(manifest?.displays || {})) if (d?.files?.[rel]) return d.files[rel].sha256', '') }],
    ['the sweep blind to drawers', { sweep: (s) => s.replace("for (const d of Object.values(manifest.displays || {})) for (const [rel, f] of Object.entries(d?.files || {})) out.add(base + contentName(rel, f.sha256))", '') }],
    ["'published' silently reading authoring", { url: (s) => s.replace("if (source === 'authoring') {", "if (source === 'authoring' || source === 'published') {") }],
    ['LightShow back on contentRoot', { show: (s) => s.replace('const { drawer: url, frame } = await drawerUrls(source, { lookId, display, contentRoot, where })', 'const url = `${import.meta.env.BASE_URL}${contentRoot}${display.drawer}`, frame = (r) => r') }],
    ['Preview naming no source', { files: { 'src/preview/PreviewApp.jsx': (s) => s.replace(' displaySource="published"', '') } }],
    ['the mirror carrying drawers again', { mirror: (s) => s.replace(", new Set(['displays']))", ')') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
