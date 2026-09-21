// claims-stage-preview-parity.mjs — DOES THE SURFACE JACOB JUDGES DRAW WHAT SHIPS?
//
// ⭐⭐ THE INVARIANT: the pipeline is SEQUENTIAL — Stage → Preview → staging. Preview
// is where work is CONFIRMED. So for every population that ships, the two views must
// mount the SAME COMPONENT from the SAME SOURCE, and any divergence must be one
// somebody DECLARED (below), never one that accumulated.
//
// ⛔ WHY THIS IS NOT A SOURCE DIFF. Stage mounts its content INDIRECTLY through
// `sceneCfg.StageEnvironment`, so a JSX grep lists `SlabBuildings` / `BakedLamps` as
// "Preview only" when both mount them — and understates the overlap exactly where it
// matters. ⭐ The comparison therefore runs on TWO RUNTIME CENSUSES, walked off the
// live R3F fiber tree in each view. This file is the probe AND the comparator.
//
// ⚠️ A TAB THAT IS NOT IN FRONT DOES NOT RUN requestAnimationFrame, so a census taken
// in a background tab reports a scene that never rendered — and it looks like a clean
// pass. The probe stamps `live.advancing`; a census that did not advance is REFUSED
// here, loudly. (2026-09-21: this invalidated an entire A/B before it was caught.)
//
// ▶ HOW TO RUN IT (three commands, in this order):
//     node checks/claims-stage-preview-parity.mjs --probe
//       → prints the browser snippet. Paste it into the DevTools console of each view
//         (Stage = /cartograph.html, Preview = /preview) with that tab IN FRONT, same
//         `?scene=`, same shot. It copies/prints one JSON blob per view.
//     node checks/claims-stage-preview-parity.mjs --record stage   < stage.json
//     node checks/claims-stage-preview-parity.mjs --record preview < preview.json
//     node checks/claims-stage-preview-parity.mjs
//       → compares, exits 1 on any undeclared divergence.
//
// ▶ MUTATION-TEST IT (it has been; see the brief's AUDIT RESULT):
//     - drop a component from either census → red, naming the population
//     - change a census `cam.far` → red
//     - `touch src/preview/PreviewApp.jsx` → red, because the census now predates the
//       app it claims to describe
//
// ⛔ NO FALLBACK. A missing census, a stale census, a census from a different town or
// a different shot, a census whose frames never advanced — every one of those is a
// FAILURE, not a skip. "Parity unknown" is the thing this check exists to make loud.
//
// Read-only. Exits 1 when the two views disagree in a way nobody declared.
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const CENSUS = (view) => path.join(ROOT, 'scratch', `parity-census-${view}.json`)

// The apps whose edits can rot parity. A census older than any of these describes a
// build that no longer exists.
const WATCHED = [
  'src/cartograph/CartographApp.jsx',
  'src/preview/PreviewApp.jsx',
  'src/components/PostProcessing.jsx',
  'src/components/CelestialBodies.jsx',
  'src/cartograph/MapLayers.jsx',
]

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ THE LEDGER OF INTENDED DIVERGENCE. Stage is an AUTHORING surface; it is
// supposed to show authoring aids, and deleting a capability to force parity is
// the wrong repair. Everything NOT named here is a finding.
// ⛔ Add to this list only with a reason, and only for something that must never
// reach a shot. A population that ships belongs in neither column.
const INTENDED_STAGE_ONLY = [
  [/^MapLayers/,              'the Designer\'s live map.json layers — the authoring surface itself'],
  [/Debug$/,                  'a debug overlay'],
  [/^Designer/,               'Designer-mode proxies (trees/lamps/arch) — never in a shot'],
  [/^Measure|^Survey/,        'authoring instruments'],
]
const INTENDED_PREVIEW_ONLY = [
  // ⛔ deliberately empty. Preview is the confirming view: anything it draws that
  // Stage does not is something the operator cannot see while authoring.
]
// Populations whose presence is a function of TIME OF DAY, not of the app. They are
// compared only when both censuses agree on the clock.
const CLOCK_DEPENDENT = [/^CelestialBodies>(Moon|Sun|Stars)/]

// ─────────────────────────────────────────────────────────────────────────────
const PROBE = String.raw`
(async () => {
  const DEPS = performance.getEntriesByType('resource').map(e => e.name)
    .find(n => /@react-three_fiber\.js/.test(n))
  if (!DEPS) throw new Error('parity probe: react-three-fiber was never loaded on this page')
  const F = await import(DEPS)
  if (F._roots.size !== 1) throw new Error('parity probe: expected 1 R3F root, found ' + F._roots.size)
  const root = [...F._roots.values()][0]
  const st = root.store.getState()

  // ⚠️ LIVENESS FIRST. Everything below is a lie if the tab is not in front.
  const f0 = st.gl.info.render.frame
  await new Promise(r => setTimeout(r, 1200))
  const f1 = st.gl.info.render.frame

  const chain = new Map()
  const nameOf = (f) => {
    const t = f.type
    if (typeof t === 'function') return t.displayName || t.name || null
    if (t && typeof t === 'object') return t.displayName || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)) || null
    return null
  }
  const seen = new Set()
  ;(function walk (f, p) {
    while (f) {
      if (seen.has(f)) { f = f.sibling; continue }
      seen.add(f)
      let q = p
      const n = nameOf(f)
      if (n && /^[A-Z]/.test(n)) q = p.concat(n)
      const sn = f.stateNode
      if (sn && sn.isObject3D && !chain.has(sn)) chain.set(sn, q)
      if (f.child) walk(f.child, q)
      f = f.sibling
    }
  })(root.fiber.current || root.fiber, [])

  const SKIP = /^(Provider|FiberProvider|ErrorBoundary|R3FErrorBoundary|CanvasContents|Suspense|StrictMode)$/
  const own = (o) => {
    let q = o, h = 0
    while (q && h++ < 100) { if (chain.has(q)) return chain.get(q).filter(s => !SKIP.test(s)).join('>'); q = q.parent }
    return '(unowned)'
  }

  const pops = {}
  st.scene.traverse((o) => {
    const c = own(o)
    const a = pops[c] || (pops[c] = { objs: 0, meshes: 0, instanced: 0, instances: 0, tris: 0, lights: 0 })
    a.objs++
    if (o.isInstancedMesh) { a.instanced++; a.instances += o.count || 0 } else if (o.isMesh) a.meshes++
    if (o.isLight) a.lights++
    const g = o.geometry, k = o.isInstancedMesh ? (o.count || 1) : 1
    if (g && g.attributes && g.attributes.position) a.tris += Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * k)
  })

  const lights = []
  st.scene.traverse((o) => {
    if (!o.isLight) return
    lights.push({
      owner: own(o), type: o.type, intensity: +(o.intensity || 0).toFixed(3), visible: !!o.visible,
      castShadow: !!o.castShadow,
      shadow: o.castShadow && o.shadow ? {
        map: o.shadow.mapSize.width, near: +o.shadow.camera.near.toFixed(2), far: +o.shadow.camera.far.toFixed(2),
        halfExtent: +Math.abs(o.shadow.camera.right ?? 0).toFixed(2),
      } : null,
    })
  })

  const fetched = [...new Set(performance.getEntriesByType('resource').map(e => e.name)
    .filter(n => n.startsWith(location.origin))
    .map(n => n.replace(location.origin, '').split('?')[0])
    .filter(n => /\.(json|glb|gltf|ktx2|bin)$/i.test(n) && !/node_modules|\.vite/.test(n)))].sort()
  const bakedScenesTouched = [...new Set(fetched
    .map(n => (n.match(/\/baked\/([^/]+)\//) || [])[1]).filter(Boolean))].sort()
  const qScene = new URLSearchParams(location.search).get('scene')
  const scene = qScene || (bakedScenesTouched.length === 1 ? bakedScenesTouched[0] : null)

  return {
    view: /preview/.test(location.pathname) ? 'preview' : 'stage',
    href: location.pathname + location.search,
    scene, bakedScenesTouched,
    takenAt: new Date().toISOString(),
    live: { f0, f1, advancing: f1 > f0, visibility: document.visibilityState },
    cam: { type: st.camera.type, near: st.camera.near, far: st.camera.far,
           fov: st.camera.fov ?? null, zoom: +(st.camera.zoom ?? 1).toFixed(4) },
    gl: { dpr: st.gl.getPixelRatio(), shadows: st.gl.shadowMap.enabled, shadowType: st.gl.shadowMap.type,
          toneMapping: st.gl.toneMapping, exposure: +st.gl.toneMappingExposure.toFixed(3),
          colorSpace: st.gl.outputColorSpace, logDepth: !!st.gl.capabilities.logarithmicDepthBuffer },
    fog: st.scene.fog ? (st.scene.fog.isFogExp2 ? 'FogExp2@' + st.scene.fog.density : 'Fog@' + st.scene.fog.near + '-' + st.scene.fog.far) : null,
    sunIntensity: (lights.find(l => l.castShadow) || {}).intensity ?? null,
    lights, populations: pops, fetched,
  }
})().then(c => { console.log('%c--- PARITY CENSUS (' + c.view + ') ---', 'font-weight:bold'); console.log(JSON.stringify(c)); try { copy(JSON.stringify(c)) } catch (e) {} return c })
`

// ─────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv[0] === '--probe') { console.log(PROBE); process.exit(0) }
if (argv[0] === '--record') {
  const view = argv[1]
  if (view !== 'stage' && view !== 'preview') { console.error('⛔ --record needs "stage" or "preview"'); process.exit(2) }
  const raw = fs.readFileSync(0, 'utf8')
  let c
  try { c = JSON.parse(raw) } catch (e) { console.error('⛔ stdin is not the census JSON: ' + e.message); process.exit(2) }
  if (c.view !== view) { console.error(`⛔ that census says view="${c.view}", you are recording it as "${view}". One of the two is wrong — do not guess.`); process.exit(2) }
  fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true })
  fs.writeFileSync(CENSUS(view), JSON.stringify(c, null, 1))
  console.log(`  ✅ recorded ${view} census — scene=${c.scene} advancing=${c.live.advancing} populations=${Object.keys(c.populations).length}`)
  process.exit(0)
}

const fail = []
const ok = []
const note = []

// ── 1. The censuses must exist, be live, and describe the build we have now.
const loaded = {}
for (const view of ['stage', 'preview']) {
  const p = CENSUS(view)
  if (!fs.existsSync(p)) {
    fail.push(`⛔ no ${view} census at ${path.relative(ROOT, p)}. PARITY IS UNKNOWN, which is the state this check exists to make loud — not a reason to pass. Run \`node checks/claims-stage-preview-parity.mjs --probe\` and take one.`)
    continue
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!c.live?.advancing) {
    fail.push(`⛔ the ${view} census was taken in a tab that was NOT rendering (frames ${c.live?.f0}→${c.live?.f1}, visibility=${c.live?.visibility}). A background tab runs no requestAnimationFrame; every number in that file describes a scene that never drew.`)
    continue
  }
  const age = fs.statSync(p).mtimeMs
  const stale = WATCHED.filter(w => { const f = path.join(ROOT, w); return fs.existsSync(f) && fs.statSync(f).mtimeMs > age })
  if (stale.length) {
    fail.push(`⛔ the ${view} census predates ${stale.join(', ')}. It describes an app that has since been edited — re-take it before trusting a word of it.`)
    continue
  }
  loaded[view] = c
}
if (Object.keys(loaded).length === 2) {
  const [s, p] = [loaded.stage, loaded.preview]
  if (!s.scene || !p.scene) {
    fail.push(`⛔ a census does not declare its town (stage=${s.scene}, preview=${p.scene}). Comparing two views of two different towns proves nothing; load each with an explicit \`?scene=\`.`)
  } else if (s.scene !== p.scene) {
    fail.push(`⛔ stage census is "${s.scene}", preview census is "${p.scene}". Two towns, no comparison.`)
  } else {
    ok.push(`both censuses are live and describe ${s.scene}`)
  }
  for (const [v, c] of Object.entries(loaded)) {
    if (c.bakedScenesTouched?.length > 1) {
      fail.push(`⛔ ${v} fetched baked artifacts for MORE THAN ONE town in a single load: ${c.bakedScenesTouched.join(', ')}. In a kit that is a cross-town leak, and it is invisible on the town you happen to be looking at.`)
    }
  }
}

if (Object.keys(loaded).length === 2) {
  const S = loaded.stage, P = loaded.preview

  // ── 2. Populations. The heart of it.
  const sameClock = S.sunIntensity !== null && P.sunIntensity !== null &&
    Math.abs(S.sunIntensity - P.sunIntensity) < 0.25
  if (!sameClock) {
    note.push(`the two views are at different points of the day (shadow-caster intensity ${S.sunIntensity} vs ${P.sunIntensity}); clock-dependent populations are reported, not failed`)
  }
  const declared = (name, ledger) => ledger.find(([re]) => re.test(name))
  const clockish = (name) => CLOCK_DEPENDENT.some(re => re.test(name))
  const keys = [...new Set([...Object.keys(S.populations), ...Object.keys(P.populations)])]
    .filter(k => k && k !== '(unowned)' && k !== '')

  for (const k of keys.sort()) {
    const a = S.populations[k], b = P.populations[k]
    if (a && !b) {
      const d = declared(k, INTENDED_STAGE_ONLY)
      if (d) { ok.push(`stage-only "${k}" — declared: ${d[1]}`); continue }
      if (clockish(k) && !sameClock) { note.push(`stage-only "${k}" — clock-dependent, and the clocks differ`); continue }
      fail.push(`⛔ "${k}" draws in STAGE and not in PREVIEW (${a.meshes} meshes / ${a.instances} instances / ${a.tris} tris). The operator is authoring against something that does not ship.`)
    } else if (b && !a) {
      const d = declared(k, INTENDED_PREVIEW_ONLY)
      if (d) { ok.push(`preview-only "${k}" — declared: ${d[1]}`); continue }
      if (clockish(k) && !sameClock) { note.push(`preview-only "${k}" — clock-dependent, and the clocks differ`); continue }
      fail.push(`⛔ "${k}" draws in PREVIEW and not in STAGE (${b.meshes} meshes / ${b.instances} instances / ${b.tris} tris). It ships, and the operator cannot see it while authoring.`)
    } else {
      if (a.instances !== b.instances) {
        fail.push(`⛔ "${k}" draws ${a.instances} instances in Stage and ${b.instances} in Preview. Same component, different data.`)
      } else if (a.meshes !== b.meshes || Math.abs(a.tris - b.tris) > Math.max(16, a.tris * 0.001)) {
        fail.push(`⛔ "${k}" draws ${a.meshes} meshes / ${a.tris} tris in Stage and ${b.meshes} / ${b.tris} in Preview.`)
      }
    }
  }
  if (!fail.some(f => /draws/.test(f))) ok.push(`every shared population draws the same geometry in both views`)

  // ── 3. The camera the frame is actually rendered through.
  for (const f of ['type', 'near', 'far', 'fov']) {
    if (S.cam[f] !== P.cam[f]) {
      fail.push(`⛔ camera.${f}: Stage ${S.cam[f]}, Preview ${P.cam[f]}. The two views frame the same shot through different optics — depth precision, DoF and z-fighting all follow this.`)
    }
  }
  if (S.cam.type === P.cam.type && S.cam.near === P.cam.near && S.cam.far === P.cam.far) {
    ok.push(`both views render the shot through a ${S.cam.type} at ${S.cam.near}–${S.cam.far}`)
  }

  // ── 4. The renderer.
  for (const f of ['shadows', 'shadowType', 'toneMapping', 'colorSpace', 'logDepth', 'dpr']) {
    if (S.gl[f] !== P.gl[f]) {
      fail.push(`⛔ renderer.${f}: Stage ${S.gl[f]}, Preview ${P.gl[f]}. Every pixel the operator judges passes through this.`)
    }
  }
  if (S.fog !== P.fog) fail.push(`⛔ fog: Stage ${S.fog}, Preview ${P.fog}.`)

  // ── 5. The light rig — and shadow casters especially.
  const casters = (c) => c.lights.filter(l => l.castShadow && l.visible && l.intensity > 0)
  const sc = casters(S), pc = casters(P)
  if (sc.length !== pc.length) {
    fail.push(`⛔ ${sc.length} shadow caster(s) in Stage, ${pc.length} in Preview (${[...sc, ...pc].map(l => l.owner).join(', ')}). A second caster doubles every shadow in one view only.`)
  } else {
    for (let i = 0; i < sc.length; i++) {
      const [x, y] = [sc[i], pc[i]]
      if (x.owner !== y.owner || x.shadow.halfExtent !== y.shadow.halfExtent || x.shadow.near !== y.shadow.near || x.shadow.far !== y.shadow.far || x.shadow.map !== y.shadow.map) {
        fail.push(`⛔ shadow caster ${i}: Stage ${x.owner} map${x.shadow.map} ${x.shadow.near}–${x.shadow.far} ±${x.shadow.halfExtent}; Preview ${y.owner} map${y.shadow.map} ${y.shadow.near}–${y.shadow.far} ±${y.shadow.halfExtent}. ⭐ A half-extent that does not change with the town is a Lafayette Square number, and it will crop the shadows of the next town silently.`)
      }
    }
    if (sc.length) ok.push(`both views cast shadows from the same ${sc.length} light(s), same frustum`)
  }
  const rig = (c) => c.lights.filter(l => l.visible && l.intensity > 0).map(l => `${l.owner}:${l.type}`).sort()
  const [sr, pr] = [rig(S), rig(P)]
  const only = (a, b) => a.filter(x => !b.includes(x))
  if (only(sr, pr).length) fail.push(`⛔ lights lit in Stage and not in Preview: ${only(sr, pr).join(', ')}`)
  if (only(pr, sr).length) fail.push(`⛔ lights lit in Preview and not in Stage: ${only(pr, sr).join(', ')}`)
}

for (const line of ok) console.log(`  ✅ ${line}`)
for (const line of note) console.log(`  ⓘ  ${line}`)
if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} divergence(s) between the surface the operator authors on and the surface that confirms what ships.`)
  process.exit(1)
}
console.log(`\n✅ Stage and Preview draw the same town the same way, apart from the declared authoring aids.`)
