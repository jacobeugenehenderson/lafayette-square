#!/usr/bin/env node
// CLAIM — THE BAKE RE-SKELETONS A STALE TOWN, AND NEVER RE-KEYS THE OPERATOR'S AUTHORING DOING IT (2026-10-28,
// BRIEF-the-bake-re-skeletons-a-stale-town). A committed town's skeleton was made once, at commit; no button re-made it, so LS's
// pour refused on a skeleton older than the street-class vocabulary and the area-highway rule never reached HPDM or Huron.
//   (1) THE STEP: pourSteps.mjs#skeletonStep reads raw/osm.json, raw/survey.json and skeleton.js's import closure, the
//       vocabulary (streetClass.js) included; never the extent or the boundary. It is not in pourSteps() (Extent's re-apply
//       runs those and must not re-skeleton).
//   (2) THE PLANT: the step recorded in a temp scene, then streetClass.js "changed" in the record: the Bake's judgement
//       (stepReads + contentChanged, as runIfDirty asks) names it, so the plan lists `skeleton`.
//   (3) THE ROUTE (serve.js, read): the Bake runs `skeleton` through runIfDirty behind the re-pour question (asks), held out of
//       ?force=1, BEFORE the coast and the pour; its 428 names the skeleton; a plan lists the pour after it. Extent's commit and
//       rollback run the same step through runSkeleton (the one recorder); /rescope runs no skeleton.
//   (4) THE GUARD (authoredKeys.mjs#authoringReKeys, on planted skeletons): a key whose chain names other ways · a capped chain
//       turned round · an interior crossing added before an authored slot · a corner whose junction moved: each refused by name;
//       a kept network refuses nothing. reskeleton.mjs writes clean/skeleton.json only after the guard (read).
//   MUTANTS (always run, each must go RED): the Bake's skeleton call removed · Extent's rescope re-skeletons · the ways comparison
//   removed · the segOrd guard removed · the ends guard removed.
//   node checks/claims-the-bake-re-skeletons-a-stale-town.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const P = await import('../cartograph/pourSteps.mjs'), PC = await import('../cartograph/pour-code.mjs')
const rel = (f) => f.replace(ROOT + '/', '')

// (1) the step
const dir0 = mkdtempSync(join(tmpdir(), 'reskel-')), raw = join(dir0, 'raw'), clean = join(dir0, 'clean'); mkdirSync(raw); mkdirSync(clean)
const paths = { raw, clean, map: join(clean, 'map.json'), skeleton: join(clean, 'skeleton.json'), overlay: join(clean, 'overlay.json'),
  geography: join(dir0, 'geography.json'), boundary: join(dir0, 'neighborhood_boundary.json'), measurements: join(raw, 'measurements.json'), centerlines: join(raw, 'centerlines.json') }
writeFileSync(join(raw, 'osm.json'), '{"ways":[]}')
const SCENE = 'lafayettesquare', LOOK = 'lafayettesquare'
try {
  const st = P.skeletonStep(SCENE, paths), { code, data } = P.stepReads(st.inputs, SCENE)
  const codeRel = code.map(rel), dataRel = data.filter(d => typeof d === 'string').map(f => f.replace(dir0 + '/', ''))
  const wantCode = ['cartograph/skeleton.js', 'src/cartograph/streetClass.js'].every(f => codeRel.includes(f))
  const noExtent = !st.inputs.some(f => f === paths.boundary || f === paths.geography)
  const notInPour = !P.pourSteps(SCENE, paths, join(clean, 'ribbons.json'), { elevation: false }).some(s => s.label === 'skeleton')
  row(wantCode && noExtent && notInPour && dataRel.join() === 'raw/osm.json,raw/survey.json' && st.outputs.length === 2,
    `(1) the skeleton step reads ${dataRel.join(', ')} and ${code.length} code file(s), streetClass.js among them (${wantCode}) · no extent or boundary (${noExtent}) · not in the pour Extent re-applies (${notInPour}) · writes ${st.outputs.map(o => o.replace(dir0 + '/', '')).join(', ')}`)

  // (2) the plant: record, then the vocabulary changes
  P.recordStep(paths.map, [LOOK], st.label, st.inputs, SCENE)
  const judge = () => { const was = P.readBakeReads(paths.map)[`${LOOK}:${st.label}`], who = `step "${st.label}"`
    return [...PC.contentChanged(was.code, code, who), ...PC.contentChanged(was.data, data, who)] }
  const clean0 = judge()
  const rec = JSON.parse(readFileSync(P.bakeReadsPath(paths.map), 'utf8')), sc = join(ROOT, 'src/cartograph/streetClass.js')
  rec[`${LOOK}:${st.label}`].code[sc] = 'a-different-vocabulary'
  writeFileSync(P.bakeReadsPath(paths.map), JSON.stringify(rec))
  const dirty = judge()
  row(!clean0.length && dirty.some(w => w.includes('streetClass.js')),
    `(2) recorded, the step is ${clean0.length ? 'DIRTY: ' + clean0.join('; ') : 'clean'} · with streetClass.js changed it is ${dirty.length ? `stale (${dirty.join('; ').slice(0, 120)})` : 'CLEAN'}`)
} finally { rmSync(dir0, { recursive: true, force: true }) }

// (3) the route
const routeRow = (S, tag) => {
  const code = S.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  const a = code.indexOf("path.match(/^\\/looks\\/([^/]+)\\/bake$/)"), body = code.slice(a, code.indexOf('_bakesInFlight.delete(id)', a))
  const at = (re) => { const m = re.exec(body); return m ? m.index : -1 }
  const sk = at(/runIfDirty\('skeleton', POUR\.skeleton\.inputs, POUR\.skeleton\.outputs, POUR\.skeleton\.cmd, \{[^}]*force: false, asks: true \}\)/)
  const coast = at(/runIfDirty\('coast'/), pipe = at(/runIfDirty\('pipeline'/)
  const ask = /if \(skel\?\.ask\) \{\s*res\.writeHead\(428/.test(body) && /the skeleton \(re-made first, then the pour\)/.test(body)
  const planAfter = /const afterSkel = skel\?\.stale/.test(body) && /\.\.\.afterSkel\]/.test(body)
  const judgeAsks = /if \(asks && !repourConfirmed\) return \{ ask: stale \}/.test(code) && /repour: true/.test(code)
  const extent = (code.match(/await runExtentSkeleton\(scene, \{ cwd: here, env \}\)/g) || []).length === 2 && /return runSkeleton\(step,/.test(code)
  // the /rescope handler: from its match to the next route's (a top-level `const …Match = path.match` or `if (`)
  const r0 = code.indexOf('const rescopeMatch'), nx = /\n  (?:const \w+ = path\.match|if \()/g; nx.lastIndex = code.indexOf('rescopeMatch[1]', r0)
  const r1 = r0 > 0 && nx.exec(code) ? nx.lastIndex : -1
  const rescopeNone = r0 > 0 && r1 > r0 && !/skeleton/i.test(code.slice(r0, r1))
  const bare = /runShell\('node skeleton\.js/.test(code)
  const pass = sk >= 0 && coast > sk && pipe > sk && ask && planAfter && judgeAsks && extent && rescopeNone && !bare
  row(tag ? !pass : pass, `${tag ? `mutant (${tag}): ` : '(3) '}the Bake's skeleton step ${sk < 0 ? 'ABSENT' : `before the coast (${coast > sk}) and the pour (${pipe > sk})`} · held out of force, behind the question naming the skeleton (${ask && judgeAsks}) · the plan lists the pour after it (${planAfter}) · commit and rollback through runSkeleton (${extent}) · rescope re-skeletons nothing (${rescopeNone}) · no bare skeleton.js run (${!bare})${tag ? (pass ? ' — the row proves nothing' : ' — RED as it must be') : ''}`)
}
const SERVE = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8')
routeRow(SERVE)
{ const M = SERVE.replace(/        const skel = await runIfDirty\('skeleton'[^\n]*\n/, '        const skel = null\n')
  routeRow(M === SERVE ? '' : M, 'the Bake\'s skeleton call removed') }
{ const M = SERVE.replace('    const scene = rescopeMatch[1]\n', '    const scene = rescopeMatch[1]\n    await runExtentSkeleton(scene, {})\n')
  routeRow(M === SERVE ? '' : M, 'Extent\'s rescope re-skeletons') }
{ const R = readFileSync(join(ROOT, 'cartograph/reskeleton.mjs'), 'utf8'), g = R.indexOf('authoringReKeys('), w = R.indexOf('writeIfChanged(skPath')
  row(g > 0 && w > g && /if \(R\.hits\.length\) throw/.test(R), `(3) reskeleton.mjs writes clean/skeleton.json only after the guard, and throws on a hit (${g > 0 && w > g})`) }

// (4) the guard, on planted skeletons
const AK_SRC = readFileSync(join(ROOT, 'cartograph/authoredKeys.mjs'), 'utf8')
const load = async (src) => { const d = mkdtempSync(join(tmpdir(), 'reskel-ak-'))
  try { writeFileSync(join(d, 'authoredKeys.mjs'), src.replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'cartograph', r)).href}"`))
    return await import(pathToFileURL(join(d, 'authoredKeys.mjs')).href) } finally { rmSync(d, { recursive: true, force: true }) } }
const chain = (id, pts, ways, extra = {}) => ({ id, points: pts.map(([x, z]) => ({ x, z })), osmIds: ways, highway: 'residential', ...extra })
// main runs west → east, crossed at x = 100 and 200; the cross streets meet it there
const before = { streets: [chain('main', [[0, 0], [100, 0], [200, 0], [300, 0]], [1, 2]), chain('first', [[100, -50], [100, 0], [100, 50]], [3]), chain('second', [[200, -50], [200, 0], [200, 50]], [4])] }
const auth = () => ({ ids: new Map([['main', ['look/design.blockCustoms']], ['first', ['look/design.cornerCornerRadiusOverrides']]]),
  caps: new Map([['main', ['overlay capEnd=round']]]), slots: new Map([['main', [{ where: 'look/design.blockCustoms', customs: { left: { 1: { w: 9 } } } }]]]),
  corners: [{ where: 'look/design.cornerCornerRadiusOverrides', key: '100.000,0.000|first:left|main:left', point: [100, 0], ids: ['first', 'main'] }] })
const H = new Set(['motorway'])
const after = {
  kept: before,
  moved: { streets: [chain('main', [[0, 0], [100, 0], [200, 0], [300, 0]], [1, 9]), ...before.streets.slice(1)] },
  turned: { streets: [chain('main', [[300, 0], [200, 0], [100, 0], [0, 0]], [1, 2]), ...before.streets.slice(1)] },
  crossing: { streets: [chain('main', [[0, 0], [50, 0], [100, 0], [200, 0], [300, 0]], [1, 2]), ...before.streets.slice(1), chain('new', [[50, -50], [50, 0], [50, 50]], [5])] },
  junction: { streets: [before.streets[0], chain('first', [[100, -50], [100, 50]], [3]), before.streets[2]] },
}
const runGuard = (M) => Object.fromEntries(Object.entries(after).map(([k, a]) => [k, M.authoringReKeys(before, a, auth(), H)]))
const say = (G) => Object.entries(G).map(([k, r]) => `${k}: ${r.hits.length ? r.hits.map(h => h.split(' ')[0]).join('+') : 'nothing'}`).join(' · ')
const verdict = (G) => !G.kept.hits.length && G.moved.hits.some(h => h.startsWith('MOVED main')) && G.turned.hits.some(h => h.startsWith('ENDS main'))
  && G.crossing.hits.some(h => h.startsWith('SEGORD main') && h.includes('left|1')) && G.junction.hits.some(h => h.startsWith('CORNER first'))
const AK = await load(AK_SRC)
{ const G = runGuard(AK); row(verdict(G), `(4) the guard refuses by name — ${say(G)}`) }
for (const [tag, from, to] of [
  ['the ways comparison removed', "if (b.join(',') !== a.join(',')) {", 'if (false) {'],
  ['the segOrd guard removed', 'if (s0 < B.length || s0 < C.length) {', 'if (false) {'],
  ['the ends guard removed', 'if (cb && ca && endWhere.length) {', 'if (false) {']]) {
  if (AK_SRC.split(from).length !== 2) { row(false, `mutant (${tag}): the anchor is not in authoredKeys.mjs once — re-aim it`); continue }
  const G = runGuard(await load(AK_SRC.replace(from, to)))
  row(!verdict(G), `mutant (${tag}): ${say(G)} — ${!verdict(G) ? 'RED as it must be' : 'the row proves nothing'}`)
}
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the Bake re-skeletons a stale town, and refuses before it re-keys the authoring')
process.exit(red ? 1 : 0)
