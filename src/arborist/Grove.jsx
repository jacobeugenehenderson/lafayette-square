/**
 * Grove — gallery of published Salon compositions, all visible at once on
 * a single ground plane. Population is roster-driven (Brief 27): a
 * composition appears once it's been Re-published in the Salon — publish
 * stamps it Hero and `syncLookRoster` adds it to the Look's
 * `design.json#/trees`. There is no separate "rate it, then add it" step;
 * visibility = published-and-in-roster, not a Fill/Mid/Hero rating.
 *
 * Two scopes: "In Look" (the active Look's roster) and "All Published"
 * (every published composition in the library — the surface for adding a
 * library composition to a Look it isn't yet in). Duds still jump out
 * side-by-side; click a tile to select it — a fixed editor panel
 * (rating, category, notes, Look membership) drives the edits rather
 * than a hover-card that chases the camera.
 *
 * Distinct from the Stage app downstream (which composes a Look from the
 * trees this view publishes). This is the operator's tree-pool review.
 *
 * Single Canvas. Tiles laid out on a square grid sized to fit the count.
 * Camera is OrbitControls (free fly) — operator wants to walk around the
 * crop and judge.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { resolveGrove } from '../../arborist/grove-eligibility.mjs'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { createCameraTween } from '../preview/cameraTween.js'
import { OverheadBaker } from './OverheadBaker.jsx'
import { HeroImpostorBaker } from './HeroImpostorBaker.jsx'
import { partitionByDirt, CAPTURE_FORMAT } from './captureKey.js'
import { OverheadSpecies, useOverheadAssets } from '../components/OverheadTrees.jsx'
import {
  useTreeAtlas, treeSwayUniforms,
  stampTreeVertexAttrs, measureChassisRadius, applyBarkUniforms, applyLeafFaceUniforms, invalidateTreeAtlas,
  cloneTreeMaterial,
} from '../components/treeAtlasMaterial.js'
import { writeCanaryTree, useCanaryTree } from '../lib/canaryTree.js'
import useArboristStore from './stores/useArboristStore.js'
import { computeDominantTrunk } from './SpecimenViewport.jsx'
import { ASSET_BASE } from '../lib/bakedUrl.js'

const TILE_SPACING = 8        // meters between tiles, edge-to-edge centers
const QUALITY_COLOR = {
  2: '#4a6a9a',   // Fill (background only)
  3: '#5a8aff',   // Mid
  4: '#6a9a4a',   // Hero
}
const QUALITY_LABEL = { 1: 'Trash', 2: 'Fill', 3: 'Mid', 4: 'Hero' }
const CATEGORIES = ['broadleaf', 'conifer', 'ornamental', 'weeping', 'columnar', 'unusual']
// Hero capture dials — MUST mirror HeroImpostorBaker's prop defaults. They are part
// of the capture fingerprint, so changing one correctly re-dirties every species.
const HERO_AZIMUTHS = 6
const HERO_SHELLS = 2

export default function Grove() {
  const variants    = useArboristStore(s => s.groveVariants)
  const loading     = useArboristStore(s => s.groveLoading)
  const publishing  = useArboristStore(s => s.grovePublishing)
  const error       = useArboristStore(s => s.groveError)
  const setGroveOpen = useArboristStore(s => s.setGroveOpen)
  const setSalonOpen = useArboristStore(s => s.setSalonOpen)
  const loadGrove   = useArboristStore(s => s.loadGrove)
  const looks       = useArboristStore(s => s.looks)
  const activeLookId = useArboristStore(s => s.activeLookId)
  const setActiveLook = useArboristStore(s => s.setActiveLook)
  const looksRosters = useArboristStore(s => s.looksRosters)
  const toggleInLook = useArboristStore(s => s.toggleInLook)
  // The demand-ordered board + the two bars — the same inputs the Salon rail uses, so the
  // rail and the bake cannot disagree about what ships.
  const rosterCoverage = useArboristStore(s => s.rosterCoverage)
  const groveThreshold = useArboristStore(s => s.groveThreshold)
  const rosterSpecies = rosterCoverage?.species || []
  const unownedRef = useRef(new Set())

  // ⭐⭐ THE CAPTURE POOL IS WHAT THE SLAB PLACES — which is what the button has always
  // said it is: "Bake this neighborhood's ROSTER to the slab … what the map renders."
  // ⛔ It used to be the LOOK's ~10 species while the slab places 24 via substitution, so
  // 14 species — 2,251 of 5,127 placements, 44% OF THE MAP — could never be captured and
  // permanently rendered as MESH. Falling back to the most expensive asset in a system
  // built to eliminate it, because the cheap one was never offered.
  const [slabSpecies, setSlabSpecies] = useState([])
  const loadSlabSpecies = useMemo(() => async (lookId) => {
    if (!lookId) { setSlabSpecies([]); return }
    try {
      const r = await fetch(`${ASSET_BASE}baked/${lookId}/trees.json?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      const seen = new Set(), out = []
      for (const i of (j.instances || [])) {
        const key = `${i.species}|${i.variantId}`
        if (seen.has(key)) continue
        seen.add(key)
        // ⭐ Carry the RUNTIME's own lod1 url. Only the Look's species have a baked,
        // atlas-rewritten GLB; the other 12 the slab places are loaded by the runtime
        // straight from /trees/<species>/, and that file is what must be captured — a
        // pool that can only name baked GLBs can never reach them.
        out.push({ species: i.species, variantId: i.variantId, runtimeUrl: i.lods?.lod1 || i.url || null })
      }
      setSlabSpecies(out)
    } catch (err) {
      // ⛔ LOUD. An empty pool captures nothing and reports success — the exact shape of
      // "all green" meaning "did not try".
      console.error('[grove-bake] could not read the slab to build the capture pool:', err.message)
      setSlabSpecies([])
    }
  }, [])
  useEffect(() => { loadSlabSpecies(activeLookId) }, [activeLookId, loadSlabSpecies])
  const warnedNoBoardRef = useRef(false)
  const [impostorGapDismissed, setImpostorGapDismissed] = useState(false)
  const groveBoard = useMemo(
    () => resolveGrove(rosterSpecies || [], groveThreshold || {}),
    [rosterSpecies, groveThreshold],
  )
  const eligibleNames = useMemo(
    () => new Set(groveBoard.filter(b => b.tier !== 'out').map(b => b.species)),
    [groveBoard],
  )
  const setGroveVariantOverride = useArboristStore(s => s.setGroveVariantOverride)
  const bakeGroveToSlab = useArboristStore(s => s.bakeGroveToSlab)
  const groveBaking = useArboristStore(s => s.groveBaking)
  const groveBakeResult = useArboristStore(s => s.groveBakeResult)
  const activeLookTrees = looksRosters[activeLookId] || []

  // The neighbourhoods behind the Looks — the axis the picker above runs on.
  // Deduped by scene, so two Looks over one neighbourhood collapse to one entry
  // rather than showing the operator the same trees twice.
  const neighborhoods = useMemo(() => {
    const byScene = new Map()
    for (const l of looks) {
      const scene = l.scene || l.id
      if (!byScene.has(scene)) byScene.set(scene, { scene, name: l.name, lookIds: [] })
      byScene.get(scene).lookIds.push(l.id)
    }
    return [...byScene.values()]
  }, [looks])
  const activeScene = looks.find(l => l.id === activeLookId)?.scene || activeLookId
  // Scene → the Look whose roster + atlas the Grove edits. One Look per scene
  // today; if that ever stops being true this silently picks the first, which is
  // the moment this needs a real sub-picker rather than a guess.
  const lookIdForScene = (scene) =>
    neighborhoods.find(n => n.scene === scene)?.lookIds[0] || scene

  // Two scopes (both populated by published compositions — visibility is
  // never gated on a Fill/Mid/Hero rating; see file header / Brief 27):
  //   'look'   — only the active Look's roster (curation review)
  //   'all'    — every published composition in the library (browse + the
  //              surface for adding a library composition to this Look)
  // Click action mirrors the scope: in 'look' the card removes from the
  // active Look; in 'all' it adds/removes membership.
  // Top-level view: 'gallery' (the by-model 3D crop) ↔ 'coverage'
  // (Brief 24 — roster-anchored have-vs-need table).
  const [view, setView] = useState('gallery')
  const [ringScale, setRingScale] = useState(1)   // Spread: cluster (small) ↔ separate (large)
  const [scope, setScope] = useState('look')
  // Hero↔Browse transition — the Grove TAKES the universal player's camera
  // animation (createCameraTween, the same easeInOutCubic + up-vector tilt the
  // player runs Hero↔Browse) for a realistic preview; its eased progress ALSO
  // crossfades the tree forms (3D specimen ↔ overhead disc). Fixed, no knobs.
  const [transitioning, setTransitioning] = useState(false)
  const transitionGuard = useRef(null)   // failsafe timer — see startTransition
  const [blend, setBlend] = useState(0)           // 0 = Hero, 1 = Browse (crossfade weight)
  const tweenRef = useRef(null)
  if (!tweenRef.current) tweenRef.current = createCameraTween()
  const poseRef = useRef({ pos: new THREE.Vector3(0, 30, 60), target: new THREE.Vector3(0, 4, 0), up: new THREE.Vector3(0, 1, 0), fov: 40 })
  const groveControlsRef = useRef()
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)  // {speciesId, variantId} — click-selected tile; drives the fixed editor panel
  const [toast, setToast] = useState(null)
  // Overhead bake — the Grove Bake→Slab ALSO captures each roster species' 3-slice
  // overhead snapshot (GPU, in this Canvas) and POSTs it into the look's slab. Runs
  // AFTER the HTTP bake (so it merges into the fresh manifest). One per species.
  const [overheadTick, setOverheadTick] = useState(0)
  const [overheadProg, setOverheadProg] = useState(null)   // {done,total} | 'done' | null
  // Hero canopy-impostor bake — the SAME Bake→Slab captures each roster species' side-on
  // hero impostor (all N azimuths = the variety pool). Chained AFTER the overhead bake
  // so only one GPU capture loop runs at a time (crash-safe). Same species list.
  const [heroTick, setHeroTick] = useState(0)
  const [heroProg, setHeroProg] = useState(null)           // {done,total} | 'done' | null
  // ⚠️ The per-species TALLY, kept apart from the progress sentinel. The status line
  // used to print "overhead ✓ · hero ✓" off `prog === 'done'` alone — i.e. "the pass
  // FINISHED", not "every species shipped" — while the `fail` count went to
  // console.log and nowhere else. A bake that refused 3 of 10 species still read as
  // two green checks, so the slab looked healthy and the missing trees showed up
  // much later as holes in the render. A capture that fails must be visible where
  // the operator is looking. (2026-07-22)
  const [overheadResult, setOverheadResult] = useState(null)  // {ok,fail} | null
  const [heroResult, setHeroResult] = useState(null)          // {ok,fail} | null
  // ⭐ Hoisted above the capture pool (2026-09-03): the pool now asks this manifest which
  // species were rewritten into THIS atlas. Declared after it, the memo hit the TDZ.
  const groveAtlas = useTreeAtlas(activeLookId)
  const overheadSpecies = useMemo(() => {
    if (!activeLookId) return []
    const base = import.meta.env.BASE_URL
    const seen = new Set(), out = []
    // ⭐ Every species the SLAB places, falling back to the Look's list only if the slab
    // has not been read yet. ⛔ The Look is a SUBSET — substitution routes 167 census
    // species onto whatever carries assets, so capturing only the Look guarantees a
    // permanent mesh population that no bake can ever reach.
    const lookSpeciesSet = new Set(activeLookTrees.map(t => t.species))
    const source = slabSpecies.length ? slabSpecies : activeLookTrees
    if (!slabSpecies.length && activeLookTrees.length) {
      console.warn('[grove-bake] slab not read yet — falling back to the Look roster, which is a SUBSET of what the map renders.')
    }
    for (const t of source) {
      if (seen.has(t.species)) continue
      seen.add(t.species)
      // ⛔ THE BARS GATE THE BAKE. This used to capture whatever sat in design.json's
      // trees[], so an UNCOMPOSED species could be checked in and shot.
      // ⛔ Fails OPEN and says so: dropping a tree on a guess is invisible, an extra
      // capture attempt is loud and cheap.
      if (!eligibleNames.size) {
        if (!warnedNoBoardRef.current) {
          warnedNoBoardRef.current = true
          console.warn('[grove-bake] roster board not loaded — capturing the FULL look roster ungated.')
        }
      } else if (!eligibleNames.has(t.species) && !eligibleByLibId(t.species, groveBoard, unownedRef)) continue
      // The BAKED per-look GLB (UVs rewritten to the unified atlas) — capture parity
      // with the runtime, which loads this same GLB + the baked atlas material.
      // Prefer the BAKED per-look GLB (UVs rewritten to the unified atlas) — that is what
      // the ten Look species capture from today and it works, so it is not being changed.
      // ⛔ Fall back to the runtime's own url for the species that have no baked GLB,
      // because capturing nothing is how 2,251 placements ended up permanently on mesh.
      // ⚠️ Those captures do NOT have atlas-rewritten UVs; if that shows, the fix is to
      // bake their GLBs into the Look, not to drop them from the pool again.
      // ⭐ WHICH GLB TO SHOOT. Only the LOOK's species get a baked, atlas-rewritten GLB
      // from bake-look; the other 12 the slab places have none, and building a baked path
      // for them yields a 404 — which is how they were silently never captured.
      // Look member → the baked GLB (what the ten capture from today; not changing what
      // works). Otherwise → the runtime's own url, which is the file the map actually
      // loads for that species and therefore the only honest thing to capture.
      // ⚠️ Those lack atlas-rewritten UVs. If that shows in the capture, the fix is to
      // bake their GLBs into the Look — NOT to drop them from the pool again.
      // ⭐⭐ ASK THE ATLAS WHICH GLB IS REWRITTEN TO IT — never the Look roster.
      // ⛔ THE BUG THIS CLOSES (2026-09-03, Jacob: "let's fix the sugar maple once and
      // for all"). This branched on Look MEMBERSHIP, on the premise that "only the Look's
      // species get a baked GLB; building a baked path for the others yields a 404." That
      // premise was false. `acer_saccharum` — sugar maple's Latin twin, 281 LS placements,
      // reached by substitution and absent from the Look — HAD a baked GLB the whole time
      // and it was ignored. So its impostor was captured from the raw library file, whose
      // UVs run u[-1.94, 3.52] v[-5.42, 1.98] (tiling, unrewritten) while the capture binds
      // the ATLAS material: wrong atlas regions entirely. It is also unscaled, so the card
      // was built for a 10.3 m tree the map draws at 11.9 m.
      // ⭐ `barkBySpecies` is the honest test, and it is a fact about THIS atlas rather than
      // about anybody's roster: bake-look writes a species there exactly when it rewrote
      // that species' GLB into this atlas. So it covers a town nobody has looked at, needs
      // no list, and cannot drift from what was actually baked.
      const rewritten = !!groveAtlas?.manifest?.barkBySpecies?.[t.species]
      if (!rewritten) {
        // ⛔ LOUD, NOT SILENT, AND ⛔ NOT A FALLBACK TO THE RAW FILE. Capturing from an
        // unrewritten GLB yields a confidently wrong impostor, which is worse than none:
        // the operator sees a tree, not a gap. Correct mesh beats wrong impostor. The name
        // is surfaced in the "no impostor" banner so it is a gap the operator can SEE.
        console.warn(`[grove-bake] "${t.species}" is not in this atlas (barkBySpecies) — its baked GLB `
          + `is not rewritten to it, so any capture would sample the wrong atlas regions. SKIPPED, loudly.`)
        continue
      }
      const glbUrl = bakedGlbUrl(activeLookId, t.species, t.variantId, 'lod1')
      if (!glbUrl) { console.warn(`[grove-bake] "${t.species}" has no GLB url in the slab — cannot capture.`); continue }
      out.push({ species: t.species, glbUrl })
    }
    return out
  }, [activeLookId, activeLookTrees, slabSpecies, eligibleNames, groveBoard, groveAtlas?.manifest])

  // ⛔ THE SKIP MUST BE SEEN. A species the pool refuses (its GLB is not rewritten into
  // this atlas) would otherwise just be absent — and "silently absent from the capture
  // pool" is exactly how 2,251 placements once ended up permanently on mesh. Surfaced in
  // the same "no impostor" banner as a capture FAILURE, because to the operator it is the
  // same fact: this tree ships as mesh at every distance, and here is its name.
  const unrewrittenSpecies = useMemo(() => {
    const bark = groveAtlas?.manifest?.barkBySpecies
    if (!bark) return []
    const source = slabSpecies.length ? slabSpecies : activeLookTrees
    const seen = new Set(), out = []
    for (const t of source) {
      if (seen.has(t.species)) continue
      seen.add(t.species)
      if (eligibleNames.size && !eligibleNames.has(t.species) && !eligibleByLibId(t.species, groveBoard, unownedRef)) continue
      if (!bark[t.species]) out.push(t.species)
    }
    return out
  }, [slabSpecies, activeLookTrees, eligibleNames, groveBoard, groveAtlas?.manifest])

  // ⭐ DRAIN-ON-BAKE (Jacob, 2026-07-22). Bake→Slab re-captures only what's DIRTY;
  // a species whose fingerprint still matches its stored capture is skipped. The
  // first bake after a big change may shoot everything and the next one shoots
  // nothing — the cost tapers to zero instead of being re-paid every bake, which
  // is what made a 10-species capture pass expensive enough to avoid running.
  //
  // Dirtiness is DERIVED (src/arborist/captureKey.js), not flagged: no ledger to
  // drift, and a species that fails or loses its assets is dirty again by
  // construction, so a retry is just "bake again".
  //
  // The ⟳ button deliberately FORCES all — it is the repair gesture, for when you
  // don't trust the fingerprint (changed capture code, a suspect asset on disk).
  const forceAll = useRef(false)
  // ⭐ The four per-species slots the shared material needs, read straight off the Look's
  // manifest — the same four `InstancedTrees` reads for the map. Bound PER DRAW inside each
  // Tile, because one material serves every tile.
  const barkUniformsBySpecies = useMemo(() => {
    const m = groveAtlas?.manifest
    if (!m) return {}
    const out = {}
    for (const species of Object.keys(m.barkBySpecies || {})) {
      out[species] = {
        barkSettings:   m.barkBySpecies[species] || null,
        // ⛔ Per VARIANT, resolved by the tile's own id — `InstancedTrees` looks it up the
        // same way (string and number key, because JSON objects stringify their keys).
        // Guessing "the first one" would paint variant 2 with variant 1's gradient.
        gradientByVariant: m.barkGradientByVariant?.[species] || null,
        detailSlot:     m.barkDetailBySpecies?.[species] || null,
        posterizedSlot: m.barkPosterizedBySpecies?.[species] || null,
        // leaf.face — the paler underside, per species. Bound in the same per-draw
        // call for the same reason the bark slots are: ten species, one material.
        leafFace:       m.leafFaceBySpecies?.[species] || null,
      }
    }
    return out
  }, [groveAtlas?.manifest])
  // ⭐ ONE MATERIAL PER SPECIES, one shader program. A single shared material cannot carry
  // ten species' bark: three.js skips the uniform upload for consecutive draws of the same
  // material, so the first-drawn tile painted all of them. See `cloneTreeMaterial`.
  const speciesMaterials = useMemo(() => {
    const base = groveAtlas?.treeMaterial
    if (!base) return {}
    // ⛔ Keyed off `variants` (the full /grove list), NOT `visible` — `visible` is declared
    // further down the component, so reading it here is a temporal-dead-zone ReferenceError
    // at render, which in this file means a black screen. Materials for a scope-filtered-out
    // species are simply unused.
    const out = {}
    for (const v of variants) {
      if (out[v.speciesId]) continue
      out[v.speciesId] = cloneTreeMaterial(base)
    }
    return out
  }, [groveAtlas?.treeMaterial, variants])
  // ⛔ The caller owns these — drop them when the set is replaced, or an authoring session
  // leaks a material per species per re-bake.
  const prevMaterials = useRef(null)
  useEffect(() => {
    const stale = prevMaterials.current
    prevMaterials.current = speciesMaterials
    if (stale && stale !== speciesMaterials) {
      for (const m of Object.values(stale)) { try { m.dispose() } catch {} }
    }
  }, [speciesMaterials])

  // The Hero↔Browse crossfade, applied to every per-species material (see the note in Tile).
  useEffect(() => {
    const mats = Object.values(speciesMaterials)
    if (!mats.length) return
    const o = 1 - blend
    const t = o < 1
    for (const mat of mats) {
      if (mat.transparent !== t) { mat.transparent = t; mat.needsUpdate = true }
      mat.opacity = o
      mat.depthWrite = !t
    }
  }, [speciesMaterials, blend])
  const heroDials = useMemo(() => ({ azimuths: HERO_AZIMUTHS, shells: HERO_SHELLS }), [])
  const overheadDirty = useMemo(() => {
    if (!groveAtlas?.manifest) return overheadSpecies
    return partitionByDirt(overheadSpecies, groveAtlas.manifest.overheadBySpecies, groveAtlas.manifest, () => null, CAPTURE_FORMAT.overhead).dirty
  }, [overheadSpecies, groveAtlas?.manifest])
  const heroDirty = useMemo(() => {
    if (!groveAtlas?.manifest) return overheadSpecies
    return partitionByDirt(overheadSpecies, groveAtlas.manifest.heroImpostorBySpecies, groveAtlas.manifest, () => heroDials, CAPTURE_FORMAT.hero).dirty
  }, [overheadSpecies, groveAtlas?.manifest, heroDials])
  // What each baker actually receives this run — the dirty subset, or everything
  // when the operator forced a re-capture.
  const overheadBatch = forceAll.current ? overheadSpecies : overheadDirty
  const heroBatch = forceAll.current ? overheadSpecies : heroDirty

  // Bake→Slab: run the HTTP roster bake, THEN kick the in-Canvas overhead capture.
  const bakeAll = async ({ ifDirty = false } = {}) => {
    forceAll.current = false
    setOverheadProg(null)
    // ⛔ The roster bake is the EXPENSIVE half (~43 s) and it never tapered — only the
    // captures did. Arrival now asks the server to skip it when every input is older
    // than the baked slab; the button below still forces. (Jacob, 2026-08-28: "it
    // rebakes every time you enter the grove. It should only bake dirty or new things.")
    await bakeGroveToSlab({ ifDirty })
    // ⛔ RE-READ THE SLAB FIRST. The roster bake just rewrote trees.json, and the capture
    // pool IS that file's species list — capturing off a stale read would shoot the
    // PREVIOUS bake's species.
    await loadSlabSpecies(activeLookId)
    // ⛔ THE ATLAS REFRESH MOVED — it used to happen HERE, immediately before the capture
    // kick below, and that is what stalled the bake at "Overhead 0/10…". Invalidating swaps
    // `atlas.treeMaterial`, which is one of the baker effect's deps, so the reload landed
    // MID-CAPTURE, aborted it, and the retry guard then refused to restart it.
    // ⭐ It now runs after BOTH captures (see the hero baker's onDone), which is also more
    // correct: the captures POST into the manifest, so re-reading before them would read a
    // manifest they are about to rewrite. The tiles show the previous bytes until then —
    // that is the waiting room, and the button says so.
    // Re-read dirt AFTER the roster bake — bake-look just rewrote the atlas, and a
    // species whose inputs moved becomes dirty exactly here.
    // ⛔ NO TOTAL HERE. `overheadBatch` is this closure's STALE value — captured before the
    // awaits above, when the atlas manifest had not loaded and `overheadDirty` therefore
    // reported EVERY species dirty. That is where "Overhead 0/10…" came from while the
    // baker was handed an empty batch: two different renders, two different answers.
    // ⭐ The baker owns the total — it is the only party that knows the real batch.
    if (overheadSpecies.length) { setOverheadProg({ done: 0, total: null }); setOverheadTick((t) => t + 1) }
  }
  // ⭐⭐ ARRIVAL IS THE BAKE (Jacob, 2026-08-26). The Grove is "a little courtesy waiting area
  // so you can peruse and shop while the bake is happening" — so the tens of seconds the bake
  // already costs are paid on ENTRY, in the background, instead of being paid later while the
  // operator sits and watches. Tiles paint immediately from what is on disk; the button carries
  // the truth (Baking… → Ready); when it lands, the atlas and the tiles refresh onto the fresh
  // artifacts. That is what makes ORIENTATION §7's Grove invariant reachable — a tree in the
  // Grove is baked and slab-ready — without a gesture anybody has to remember.
  //
  // ⛔ Once per Look, not once per render. The bake's own drain-on-bake fingerprinting means a
  // re-entry with nothing dirty shoots nothing, so this taper to near-zero rather than
  // re-paying on every visit.
  const autoBakedFor = useRef(null)
  useEffect(() => {
    if (!activeLookId || groveBaking) return
    if (autoBakedFor.current === activeLookId) return
    autoBakedFor.current = activeLookId
    bakeAll({ ifDirty: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLookId])

  // Re-capture BOTH impostor pools onto the ALREADY-baked slab (no 30s roster
  // re-bake) — off the current baked lod1 GLBs → POSTed into the slab.
  //
  // This used to be a hero-ONLY button, which is why the Grove had two bake
  // gestures and nobody could tell whether hero was part of Bake→Slab or a step
  // you had to remember (it is part of it — Bake→Slab chains both captures).
  // Hero got a standalone refresh because the agent building that arc needed one
  // for his own eye-gate loop; overhead never had one, and the asymmetry read as
  // meaning. The operator concept is "re-capture the impostors," singular — the
  // two pools are one product split by viewing hemisphere, and refreshing one
  // against an atlas the other hasn't seen is a drift waiting to happen.
  // Overhead's onDone chains hero, so kicking overhead runs both. (2026-07-22)
  const recaptureImpostors = () => {
    if (!overheadSpecies.length) return
    forceAll.current = true          // repair gesture — ignore the fingerprints
    setOverheadResult(null); setHeroResult(null); setImpostorGapDismissed(false)
    setOverheadProg({ done: 0, total: null }); setOverheadTick((t) => t + 1)   // the baker owns the total
  }

  // Per-operator UI preference: tell the Meteorologist helper which tree
  // to use as its CanaryScene hero. Cross-tab via the `storage` event
  // (browsers fire it in OTHER tabs on same origin automatically). No
  // backend, no authored state — see ARCHITECTURE.md
  // "Arborist ↔ Meteorologist canary contract".
  // ⭐ THE LIVE CANARY, so the control can say what IS rather than only what it
  // WILL DO. It was a fire-and-forget button with a 1.5s toast: click it and the
  // panel looked identical afterwards, so there was no way to tell which tree was
  // the canary — or whether the click had landed at all (Jacob, 2026-08-23:
  // "Nothing happened to the button so we can't tell that this is now the
  // canary"). ⚠️ Especially bad here, because /grove serves BOTH `acer_saccharum`
  // and `maple_sugar` as separate tiles: two different trees, one plausible name.
  const canary = useCanaryTree()
  const toastTimerRef = useRef(null)
  const setMeteorologistCanary = (v) => {
    // ⚠ Through the shared writer, which also fires the same-tab StorageEvent —
    // Grove used to call setItem directly, so a viewer sharing THIS tab (the
    // full monte) never heard the click. Invisible while the only viewer was
    // Meteorologist in another tab.
    writeCanaryTree({ species: v.speciesId, variantId: v.variantId, lookId: activeLookId })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(`Set as Meteorologist canary · ${v.speciesLabel || v.speciesId} v${v.variantId}`)
    toastTimerRef.current = setTimeout(() => setToast(null), 1500)
  }
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // Hover is now only a light highlight preview — the editor is
  // selection-driven (click a tile → fixed panel), so there's no
  // cursor-to-card travel to keep alive. Pointer-down coords let an
  // empty-space click deselect while rejecting an orbit drag (which
  // also ends with the cursor over empty space).
  const downRef = useRef(null)

  const activeLook = looks.find(l => l.id === activeLookId)
  // ⭐⭐ THE BARS PRECEDE THE GROVE (Jacob, 2026-08-25). The order in time is
  // roster → BARS → GROVE → bake: the operator selects with the bars, and the Grove is
  // where they see the selected species TOGETHER and check the ensemble goes.
  // ⛔ This asked `design.trees` — the Look's republish-populated list — which runs
  // INDEPENDENTLY of the bars and in the opposite direction. Two lists, and every bug
  // tonight lived in the gap: species above the bar but absent from design.trees got no
  // atlas rect and rendered maroon; platanus_acerifolia sat in design.trees without being
  // green and was captured anyway; and 13 published meshes were invisible in the plenum.
  // ⭐ The Grove now shows THE SELECTION. One set, and the Grove is its view.
  const inLook = (v) => eligibleNames.size
    ? (eligibleNames.has(v.speciesId) || eligibleByLibId(v.speciesId, groveBoard, unownedRef))
    : activeLookTrees.some(t => t.species === v.speciesId && Number(t.variantId) === Number(v.variantId))

  const visible = useMemo(() => {
    let rows = variants
    if (scope === 'look') rows = rows.filter(v => inLook(v))
    // One representative per species — no duplicate / variant-group tiles.
    // Keep the highest-quality variant (ties → lowest variantId) so the gallery
    // reads as distinct trees, not 5× the same birch.
    const bySpecies = new Map()
    for (const v of rows) {
      const cur = bySpecies.get(v.speciesId)
      if (!cur || v.quality > cur.quality || (v.quality === cur.quality && v.variantId < cur.variantId)) {
        bySpecies.set(v.speciesId, v)
      }
    }
    rows = [...bySpecies.values()]
    return [...rows].sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality
      const s = (a.speciesLabel || a.speciesId).localeCompare(b.speciesLabel || b.speciesId)
      if (s !== 0) return s
      return a.variantId - b.variantId
    })
  }, [variants, scope, activeLookTrees])
  // (activeLookTrees is recomputed each render via looksRosters[activeLookId])

  // Trees in a RING (2026-07-11, Jacob) — every specimen equidistant from the
  // center, so none recede or occlude the way the back rows did in the old grid.
  // Radius sized so the canopies clear each other around the circumference.
  const N = Math.max(1, visible.length)
  const ringRadius = Math.max(TILE_SPACING, (visible.length * TILE_SPACING) / (2 * Math.PI)) * ringScale
  const positions = visible.map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2   // first at the back, sweep around
    return [ringRadius * Math.cos(a), 0, ringRadius * Math.sin(a)]
  })

  // The two view poses (Hero = perspective, angled; Browse = straight-down, up
  // tilted to [0,0,-1] like the player's overhead). startTransition hands them to
  // the shared player tween; TransitionDriver applies the eased pose each frame.
  const poseFor = (vw) => {
    const span = ringRadius * 2 + TILE_SPACING
    return vw === 'browse'
      ? { pos: [0, span * 1.15 + 40, 0.0001], target: [0, 0, 0], up: [0, 0, -1], fov: 40 }
      : { pos: [0, span * 0.6 + 12, span * 0.9 + 18], target: [0, 4, 0], up: [0, 1, 0], fov: 40 }
  }
  const startTransition = (target) => {
    if (target === view || transitioning) return
    tweenRef.current.start({
      from: poseFor(view), to: poseFor(target), duration: 1200, ease: 'easeInOutCubic',
      onUpdate: (op, ot, fov, e, ou) => {
        poseRef.current.pos.copy(op); poseRef.current.target.copy(ot)
        poseRef.current.up.copy(ou); poseRef.current.fov = fov
        setBlend(target === 'browse' ? e : 1 - e)
      },
      onComplete: () => { setView(target); setTransitioning(false); setBlend(target === 'browse' ? 1 : 0) },
    })
    setTransitioning(true)
    // FAILSAFE. `transitioning` disables BOTH view buttons, and the only thing
    // that clears it is the tween's onComplete — which is ticked from a useFrame
    // INSIDE the Canvas. If that frame loop isn't running (Suspense boundary
    // still resolving, tab backgrounded, a WebGL context loss, or a re-render
    // that hands us a fresh tween), the flag latches true and the Hero/Browse
    // toggle is dead for the rest of the session with no error anywhere. Commit
    // the view on a timer past the 1200ms tween so the UI can never wedge.
    clearTimeout(transitionGuard.current)
    transitionGuard.current = setTimeout(() => {
      setView(target); setTransitioning(false); setBlend(target === 'browse' ? 1 : 0)
    }, 2000)
  }

  // The click-selected tile's data drives the fixed editor panel.
  // Derived from the visible set so it stays bound to what's on screen;
  // if a scope/view change filters the tile out, drop the selection.
  const selectedVariant = selected
    ? visible.find(v => v.speciesId === selected.speciesId && Number(v.variantId) === Number(selected.variantId))
    : null
  useEffect(() => {
    if (selected && !visible.some(v => v.speciesId === selected.speciesId && Number(v.variantId) === Number(selected.variantId))) {
      setSelected(null)
    }
  }, [visible, selected])

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 12,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      <header style={{
        padding: '10px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => { setGroveOpen(false); setSalonOpen(true) }} style={btn()}>← Salon</button>
        <strong style={{
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Grove</strong>
        {/* The neighborhood IS the selector (2026-07-11, Jacob) — and as of
            2026-07-15 it is sourced from the SCENES behind the Looks, not from
            the Looks. The Grove curates a neighbourhood's trees: its census, its
            roster, its assets are all neighbourhood facts, and a Look is only a
            way to light them. Selecting one still resolves to a Look because the
            roster + custom atlas are Look-keyed ON DISK
            (looks/<id>/design.json → baked/<look>/) — that resolution is exact
            while every Look's scene equals its id, and this is the seam that
            grows a Look sub-picker the day a winter LS sits over the same
            neighbourhood. Gallery/Coverage toggle removed; Coverage belongs in
            the Salon, not here. */}
        <label style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Neighborhood
        </label>
        <select value={activeScene || ''} onChange={(e) => setActiveLook(lookIdForScene(e.target.value))}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#ddd', borderRadius: 4, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit',
          }}>
          {neighborhoods.map(n => <option key={n.scene} value={n.scene}>{n.name}</option>)}
        </select>
        {(
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          {/* View: Specimen (the lit 3D you author) ↔ Browse (the slab's OWN
              overhead disc render — the exact OverheadSpecies consumer the map
              ships, so what you see here is what the map draws in plan view).
              Browse reflects the LAST Bake→Slab (the disc is a baked artifact). */}
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 'gallery', label: 'Hero' },
              { v: 'browse',  label: 'Browse' },
            ].map(o => (
              <button key={o.v} onClick={() => startTransition(o.v)} disabled={transitioning}
                title={o.v === 'browse'
                  ? 'The overhead disc as the map ships it (last bake) — top-down, same OverheadSpecies consumer'
                  : 'The lit 3D specimen'}
                style={{
                  border: 'none', padding: '6px 10px', fontSize: 11,
                  background: view === o.v ? 'rgba(150,220,130,0.22)' : 'transparent',
                  color: view === o.v ? '#cfeeb4' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          {/* Spread — resize the ring so trees read both clustered (dense grove,
              like the map) and separate (inspect one). Applies to Hero + Browse. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Spread
            <input type="range" min={0.25} max={3} step={0.05} value={ringScale}
              onChange={(e) => setRingScale(Number(e.target.value))}
              title="Cluster ↔ separate the ring" style={{ width: 90 }} />
          </label>
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            {[
              { v: 'look', label: 'In Look' },
              { v: 'all',  label: 'All Published' },
            ].map(o => (
              <button key={o.v} onClick={() => setScope(o.v)}
                style={{
                  border: 'none', padding: '6px 10px', fontSize: 11,
                  background: scope === o.v ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: scope === o.v ? '#fff' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          <button
            onClick={bakeAll}
            disabled={groveBaking || !!(overheadProg && overheadProg !== 'done') || !!(heroProg && heroProg !== 'done') || !activeLookId}
            title={`Bake this neighborhood's roster to the slab (atlas + placements + overhead snapshots + hero canopy impostors) — what the map renders. Takes ~10-30s.`}
            style={{
              border: '1px solid rgba(150,220,130,0.4)', borderRadius: 4,
              padding: '6px 14px', fontSize: 11, fontWeight: 600,
              background: groveBaking ? 'rgba(150,220,130,0.15)' : 'rgba(150,220,130,0.22)',
              color: '#cfeeb4', fontFamily: 'inherit',
              cursor: (groveBaking || !activeLookId) ? 'not-allowed' : 'pointer',
              opacity: (groveBaking || !activeLookId) ? 0.5 : 1,
            }}>
            {/* ⛔ A CONTROL MAY NOT LOSE ITS NAME. Both buttons used to overwrite their label
                with the SAME capture-progress string, so mid-capture the operator faced two
                identically-labelled buttons and no way to tell the bake from the repair
                gesture — and the label was stale anyway. Progress belongs in the status
                line, which already exists. (Jacob, 2026-09-03: "these controls are never
                comprehensible.") */}
            {groveBaking ? 'Baking…' : 'Bake → Slab'}
          </button>
          {/* RE-CAPTURE both impostor pools onto the already-baked slab (no roster
              re-bake). A repair/iteration gesture — Bake→Slab already runs both. */}
          <button
            onClick={recaptureImpostors}
            disabled={groveBaking || !!(overheadProg && overheadProg !== 'done') || !!(heroProg && heroProg !== 'done') || !activeLookId}
            title="Re-capture BOTH impostor pools (overhead + hero) onto the already-baked slab — no full roster re-bake. Bake → Slab already does this; use it to retry after a failed capture or to re-shoot after changing capture dials."
            style={{
              border: '1px solid rgba(150,200,220,0.4)', borderRadius: 4,
              padding: '6px 12px', fontSize: 11, fontWeight: 600, marginLeft: 6,
              background: 'rgba(150,200,220,0.18)', color: '#bfe2f0', fontFamily: 'inherit',
              cursor: (groveBaking || !activeLookId) ? 'not-allowed' : 'pointer',
              opacity: (groveBaking || !activeLookId) ? 0.5 : 1,
            }}>
            {'⟳ Re-capture impostors'}
          </button>
          {/* ⭐ CAPTURE PROGRESS LIVES HERE NOW, and an empty batch says so in words. A
              counter that sits at 0 is indistinguishable from a hang; "nothing to capture"
              is the same fact an operator can act on. `total: null` = kicked, batch not
              yet known — the baker fills it in on its first species. */}
          {(() => {
            const p = (overheadProg && overheadProg !== 'done') ? ['overhead', overheadProg]
              : (heroProg && heroProg !== 'done') ? ['hero', heroProg]
              : null
            if (!p) return null
            const [which, prog] = p
            return (
              <span style={{ color: '#bce0a0', fontSize: 11 }}>
                capturing {which} {prog.total ? `${prog.done}/${prog.total}` : '…'}
              </span>
            )
          })()}
          {groveBakeResult && !groveBaking && (
            <span style={{ color: groveBakeResult.error ? '#f88' : '#bce0a0', fontSize: 11 }}>
              {groveBakeResult.error
                ? `bake failed: ${groveBakeResult.error}`
                : `✓ ${groveBakeResult.count} trees placed (${groveBakeResult.uniqueVariants} variants, ${(groveBakeResult.totalMs/1000).toFixed(0)}s)`}
              {overheadProg === 'done' && (
                overheadResult?.fail
                  ? null
                  : overheadResult?.empty
                    ? ' · overhead ✓ nothing to capture'
                    : ` · overhead ✓ ${overheadResult?.ok ?? ''}`)}
              {heroProg === 'done' && (
                heroResult?.fail
                  ? null
                  : heroResult?.empty
                    ? ' · hero ✓ nothing to capture'
                    : ` · hero ✓ ${heroResult?.ok ?? ''}`)}

            </span>
          )}
        </span>
        )}
      </header>

      {(() => {
        // ⛔ "3 of 4 species FAILED" printed an INTERNAL BATCH SIZE as if it were the
        // operator's species count — 4 was however many the drain-on-bake happened to
        // re-shoot, so the denominator meant nothing to the reader and the ratio changed
        // every bake while the SAME species kept failing.
        // ⭐ Name the trees. An operator needs WHICH and WHAT NEXT, never a ratio over a
        // batch they cannot see. Loud enough not to be silent, but one line, and it
        // dismisses until the next bake.
        const names = [...new Set([...(overheadResult?.failedNames || []), ...(heroResult?.failedNames || []), ...unrewrittenSpecies])]
        if (!names.length || impostorGapDismissed) return null
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
            background: 'rgba(200,120,60,0.10)', borderBottom: '1px solid rgba(200,120,60,0.25)',
            fontSize: 11, color: '#e0b088',
          }}>
            <span>
              no impostor: <b style={{ color: '#f0c8a0' }}>{names.join(', ')}</b>
              <span style={{ color: '#9a8878' }}> — these render as mesh at every distance. Withhold them, or fix the capture.</span>
            </span>
            <button onClick={() => setImpostorGapDismissed(true)} title="Dismiss until the next bake"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#9a8878', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>×</button>
          </div>
        )
      })()}

      <div
        style={{ flex: 1, position: 'relative', minHeight: 0 }}
        onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY } }}
      >
        {<>
        {publishing && (
          <div style={overlayMsg}>Publishing your Salon edits…</div>
        )}
        {loading && !publishing && (
          <div style={overlayMsg}>Loading manifests…</div>
        )}
        {error && (
          <div style={{ ...overlayMsg, color: '#f88' }}>Grove failed: {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={overlayMsg}>
            {scope === 'look'
              ? <>No compositions in <strong>{activeLook?.name || 'this Look'}</strong> yet. Compose a species in the Salon and Re-publish, or switch to <em>All Published</em> above to add an existing composition.</>
              : <>No published compositions yet. Compose a species in the Salon and Re-publish — published compositions show up here automatically.</>}
          </div>
        )}

        <Canvas
          shadows
          camera={{ position: [0, 30, 60], near: 0.5, far: 1000, fov: 40 }}
          onPointerMissed={(e) => {
            // Click that hit nothing → deselect. Skip if the pointer
            // travelled far between down/up (an orbit drag, not a click).
            const d = downRef.current
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
            setSelected(null)
          }}
        >
          <color attach="background" args={['#f7f5f1']} />
          {/* Rides the Bake→Slab button: captures each roster species' overhead
              (GPU, this Canvas) → POSTs into the look's slab. See OverheadBaker. */}
          <OverheadBaker
            runTick={overheadTick}
            lookId={activeLookId}
            species={overheadBatch}
            onProgress={(done, total) => setOverheadProg({ done, total })}
            onDone={({ ok, fail, failedNames, empty }) => {
              setOverheadProg('done'); setOverheadResult({ ok, fail, failedNames, empty })
              console.log(`[overhead-bake] done — ${ok} ok, ${fail} failed`)
              // Chain the hero capture (one GPU loop at a time). Same species list.
              if (heroBatch.length) { setHeroProg({ done: 0, total: null }); setHeroTick((t) => t + 1) }
              else setHeroProg('done')
            }}
          />
          {/* Same Bake→Slab: captures each roster species' side-on HERO impostor
              (all N azimuths = the per-instance variety pool) → POSTs into the slab. */}
          <HeroImpostorBaker
            runTick={heroTick}
            lookId={activeLookId}
            species={heroBatch}
            onProgress={(done, total) => setHeroProg({ done, total })}
            onDone={({ ok, fail, failedNames, empty }) => {
              setHeroProg('done'); setHeroResult({ ok, fail, failedNames, empty })
              console.log(`[hero-impostor-bake] done — ${ok} ok, ${fail} failed`)
              // ⭐ The LAST step, and only now: both captures have POSTed into the manifest,
              // so this is the first moment the atlas on disk is the one the Grove should
              // render. Doing it earlier is what aborted the capture (see bakeAll).
              invalidateTreeAtlas(activeLookId)
              loadGrove()
            }}
          />
          {/* Ambient breeze — advances the shared foliage-sway clock so the Grove
              reads as alive (Hero specimens rustle, Browse discs wiggle), through
              the SAME uniforms/shader the player uses. See GroveWind. */}
          <GroveWind />
          <hemisphereLight args={['#ffffff', '#e8e4dc', 0.85]} />
          <directionalLight
            position={[40, 80, 30]} intensity={0.55} castShadow
            shadow-mapSize-width={2048} shadow-mapSize-height={2048}
            shadow-camera-left={-200} shadow-camera-right={200}
            shadow-camera-top={200} shadow-camera-bottom={-200}
            shadow-camera-near={0.5} shadow-camera-far={400}
          />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            onClick={(e) => { if (e.delta > 5) return; setSelected(null) }}
          >
            <planeGeometry args={[2000, 2000]} />
            <meshStandardMaterial color="#f7f5f1" roughness={1} />
          </mesh>

          {/* Both tree forms mount during the transition so they CROSSFADE
              (Tile 3D specimen fades out as the Browse disc fades in), driven by
              the shared player tween's eased progress → `blend`. */}
          {(view === 'gallery' || transitioning) && (
            <Suspense fallback={null}>
              {visible.map((v, i) => (
                <TileBoundary
                  key={`${v.speciesId}:${v.variantId}`}
                  label={`${v.speciesLabel || v.speciesId} (variant ${v.variantId})`}
                  position={positions[i]}
                >
                <Tile
                  variant={v}
                  position={positions[i]}
                  opacity={1 - blend}
                  inLook={inLook(v)}
                  atlas={groveAtlas}
                  material={speciesMaterials[v.speciesId] || null}
                  lookId={activeLookId}
                  barkUniforms={barkUniformsBySpecies[v.speciesId] || null}
                  hovered={hovered?.speciesId === v.speciesId && Number(hovered?.variantId) === Number(v.variantId)}
                  selected={selected?.speciesId === v.speciesId && Number(selected?.variantId) === Number(v.variantId)}
                  onHoverIn={() => setHovered({ speciesId: v.speciesId, variantId: v.variantId })}
                  onHoverOut={() => setHovered(h => (h?.speciesId === v.speciesId && Number(h?.variantId) === Number(v.variantId) ? null : h))}
                  onSelect={() => setSelected({ speciesId: v.speciesId, variantId: v.variantId })}
                />
                </TileBoundary>
              ))}
            </Suspense>
          )}

          {/* Browse: the slab's OWN overhead disc render (OverheadSpecies), one
              species per ring slot at the same positions as the specimens, so a
              toggle compares specimen↔shipped-disc in place. Same consumer, same
              baked bands → true parity with the map's plan view. */}
          {(view === 'browse' || transitioning) && (
            <Suspense fallback={null}>
              <GroveBrowse
                species={visible} positions={positions} lookId={activeLookId}
                opacity={blend}
                inLook={inLook} hovered={hovered} selected={selected}
                onHoverIn={(v) => setHovered({ speciesId: v.speciesId, variantId: v.variantId })}
                onHoverOut={(v) => setHovered(h => (h?.speciesId === v.speciesId && Number(h?.variantId) === Number(v.variantId) ? null : h))}
                onSelect={(v) => setSelected({ speciesId: v.speciesId, variantId: v.variantId })}
              />
            </Suspense>
          )}

          <ViewCamera view={view} count={visible.length} radius={ringRadius} transitioning={transitioning} />
          <TransitionDriver tween={tweenRef.current} poseRef={poseRef} controlsRef={groveControlsRef} />
          <OrbitControls
            ref={groveControlsRef} makeDefault
            enabled={!transitioning}
            enableRotate={view !== 'browse'}
            target={view === 'browse' ? [0, 0, 0] : [0, 4, 0]}
          />
        </Canvas>

        {selectedVariant && (
          <GroveEditorPanel
            variant={selectedVariant}
            inLook={inLook(selectedVariant)}
            activeLookId={activeLookId}
            activeLookName={activeLook?.name}
            onSetOverride={(key, val) => setGroveVariantOverride(selectedVariant.speciesId, selectedVariant.variantId, key, val)}
            onToggleInLook={() => toggleInLook(activeLookId, selectedVariant.speciesId, selectedVariant.variantId)}
            onSetMeteorologistCanary={() => setMeteorologistCanary(selectedVariant)}
            isCanary={!!canary && canary.species === selectedVariant.speciesId
                      && Number(canary.variantId) === Number(selectedVariant.variantId)}
            onClose={() => setSelected(null)}
          />
        )}

        {toast && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20,20,24,0.95)',
            color: '#c0e0a8',
            padding: '8px 14px', borderRadius: 4,
            border: '1px solid #5a8a5a',
            fontSize: 11, letterSpacing: '0.04em',
            pointerEvents: 'none', zIndex: 3,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>{toast}</div>
        )}
        </>}
      </div>
    </div>
  )
}

// GroveWind — the Grove's SwayDriver. It has no live weather feed, so it drives a
// constant gentle authoring breeze (the canary's calm fallback, HERO_BREEZE_MPS =
// 3.0) into the SHARED treeSwayUniforms + advances uTime. Every tree shader in the
// scene — the Hero specimens' injectFoliageSway rustle AND the Browse discs'
// injectOverheadStamp wiggle — reads these same uniforms, so nothing renders a
// parallel path: what breathes here breathes in the player. (Systemic follow-on:
// a baseline rustle floor on the OVERHEAD path so calm weather isn't dead-still in
// the live map too — task #15 "B".)
const GROVE_BREEZE_MPS = 3.0
function GroveWind() {
  useFrame((_, dt) => {
    treeSwayUniforms.uTime.value += dt
    treeSwayUniforms.uWindForce.value.set(GROVE_BREEZE_MPS, 0, 0)
    treeSwayUniforms.uWindIntensity.value = GROVE_BREEZE_MPS
    treeSwayUniforms.uGustFrontVelocity.value.set(GROVE_BREEZE_MPS * 2.5, 0, 0)
    treeSwayUniforms.uGustsScale.value   = 1.5
    treeSwayUniforms.uGustEnvelope.value = 1.0
  })
  return null
}

function ViewCamera({ view, count, radius, transitioning }) {
  // Snap the camera to the committed view's pose on mount / count change — but NOT
  // during a transition (TransitionDriver owns the camera then). Re-frames only on
  // view/count, never radius (the Spread slider must not re-zoom → trees would
  // appear to shrink). Pose math MATCHES poseFor() so the tween lands here exactly.
  const { camera } = useThree()
  const radiusRef = useRef(radius)
  radiusRef.current = radius
  useEffect(() => {
    if (!count || transitioning) return
    const span = radiusRef.current * 2 + TILE_SPACING
    if (view === 'browse') {
      camera.position.set(0, span * 1.15 + 40, 0.0001)   // ~straight above center
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)
    } else {
      camera.position.set(0, span * 0.6 + 12, span * 0.9 + 18)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 4, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, count, transitioning, camera])
  return null
}

// TransitionDriver — ticks the SHARED player camera tween each frame and applies
// the eased pose to the Grove camera (position + up-tilt + target), exactly as the
// universal player animates Hero↔Browse. OrbitControls is disabled during the tween
// (feedback_orbitcontrols_disable_to_drive_camera); on finish we sync the control
// target once so OrbitControls resumes cleanly from where the tween left the camera.
function TransitionDriver({ tween, poseRef, controlsRef }) {
  const { camera } = useThree()
  const wasActive = useRef(false)
  useFrame(() => {
    if (tween.isActive()) {
      tween.tick(performance.now())
      const p = poseRef.current
      camera.position.copy(p.pos)
      camera.up.copy(p.up)
      camera.lookAt(p.target)
      wasActive.current = true
    } else if (wasActive.current) {
      wasActive.current = false
      const c = controlsRef.current
      if (c) { c.target.copy(poseRef.current.target); c.update() }
    }
  })
  return null
}

// GroveBrowse — the slab's overhead render, IN the Grove. It loads the same baked
// overhead bands through the SAME useOverheadAssets loader the map uses, and mounts
// the SAME OverheadSpecies disc-stacks (one instance per species at its ring slot).
// So what renders here IS the map's plan-view draw — no separate path, true parity.
// Reads the LAST Bake→Slab (the disc is a baked artifact); re-bake to refresh.
// ⭐ WHO OWNS THE LIB, answered by the server rather than guessed here. Substitution
// means many roster species route to one library, so "covering contains X" cannot answer
// "who owns X" — asked that way it resolved maple_sugar to a cultivar row and then to
// Maple, Norway, both red, both silently dropping a green species while the bake reported
// ALL GREEN because it never tried. roster-coverage emits `ownsLibIds`, computed with
// vocabulary.mjs (filesystem-bound, browser-unsafe), so `acer_saccharum` and `maple_sugar`
// resolve to one row.
// ⛔ A TILE THAT CANNOT LOAD MUST SAY SO. The Grove now renders the BAKED specimen, which
// may legitimately not exist yet — first entry to a Look, or a species that ships but has
// never been baked (`nyssa_sylvatica` places 230 times on LS and has no baked GLB today).
// Without this, `useGLTF`'s throw escapes to the gallery's single Suspense boundary and takes
// EVERY tile down with it — one missing file reads as "the Grove is broken", or worse, as an
// empty grove that looks calm. One dead tile, named, on its own plot.
class TileBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) {
    console.error(`[grove] "${this.props.label}" could not load its baked specimen — `
      + `it is not in this Look's bake. ${err?.message || err}`)
  }
  render() {
    if (!this.state.failed) return this.props.children
    const [x, , z] = this.props.position
    return (
      <group position={[x, 0, z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
          <meshBasicMaterial color="#a33" transparent opacity={0.5} toneMapped={false} />
        </mesh>
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[0.35, 6, 0.35]} />
          <meshStandardMaterial color="#a33" roughness={1} />
        </mesh>
      </group>
    )
  }
}

// ⭐ ONE definition of where a baked specimen lives. The capture pool built this path
// inline and the Tile now needs the same one; a second spelling is how a surface ends up
// silently loading a different artifact than the one it is judging.
// ⛔ DEFAULT lod1, NOT lod0. lod0 is not published (.gitignore), so a caller that
// omits the argument used to build a URL that 404s on every deployed build — the
// same defect that blanked theward.online's diorama on 2026-08-28.
function bakedGlbUrl(lookId, species, variantId, lod = 'lod1') {
  return `${ASSET_BASE}baked/${lookId}/trees/${species}/skeleton-${variantId}-${lod}.glb`
}

function eligibleByLibId(libId, board, warnRef) {
  const owner = board.find(b => (b.ownsLibIds || []).includes(libId))
    || board.find(b => b.canonicalId === libId)
  if (owner) return owner.tier !== 'out'
  if (warnRef && !warnRef.current.has(libId)) {
    warnRef.current.add(libId)
    console.warn(`[grove-bake] "${libId}" has no owning roster row — INCLUDED rather than dropped; the bars are not gating it.`)
  }
  return true
}

function GroveBrowse({ species, positions, lookId, opacity = 1, inLook, hovered, selected, onHoverIn, onHoverOut, onSelect }) {
  const atlas = useTreeAtlas(lookId)
  const overheadBySpecies = atlas?.manifest?.overheadBySpecies || null
  const speciesList = useMemo(() => species.map(v => v.speciesId), [species])
  const assets = useOverheadAssets({
    enabled: !!overheadBySpecies,
    lookName: lookId,
    overheadBySpecies,
    species: speciesList,
  })
  if (!assets) return null
  return (
    <>
      {species.map((v, i) => {
        const asset = assets.get(v.speciesId)
        if (!asset) return null
        const [x, , z] = positions[i]
        const isHov = hovered?.speciesId === v.speciesId && Number(hovered?.variantId) === Number(v.variantId)
        const isSel = selected?.speciesId === v.speciesId && Number(selected?.variantId) === Number(v.variantId)
        const inL = inLook(v)
        return (
          <group key={v.speciesId}>
            <OverheadSpecies asset={asset} instances={[{ x, y: 0, z, rotY: 0, scale: 1 }]} visible opacity={opacity} />
            {/* Base plate — the SAME quality circle + selection ring as the Hero
                Tile (same size / colour / opacity logic / GROUND position). The
                overhead discs disable raycast (below) so top-down clicks reach this
                plate. Matches the Grove's existing selection design. */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[x, 0.005, z]}
              onPointerOver={(e) => { e.stopPropagation(); onHoverIn(v) }}
              onPointerOut={() => onHoverOut(v)}
              onClick={(e) => { e.stopPropagation(); if (e.delta > 5) return; onSelect(v) }}
            >
              <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
              <meshStandardMaterial
                color={QUALITY_COLOR[v.quality] || '#666'}
                opacity={inL ? ((isHov || isSel) ? 0.95 : 0.78) : ((isHov || isSel) ? 0.45 : 0.22)}
                transparent
                roughness={0.85}
              />
            </mesh>
            {isSel && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, z]}>
                <ringGeometry args={[TILE_SPACING * 0.44, TILE_SPACING * 0.5, 48]} />
                <meshBasicMaterial color="#bce0a0" transparent opacity={0.95} toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

// ⭐⭐ THE GROVE INVARIANT (Jacob, 2026-08-23; ORIENTATION §7 OWED): *a tree in the Grove
// should already be baked and ready for the slab.* The Grove is where the operator culls in
// context — a judgment surface — so it has to sit on the FAR side of the slab boundary.
//
// ⛔ IT DID NOT. This tile loaded `/trees/<sp>/…` (the PUBLISHED GLB) and rendered it with the
// GLB's OWN materials — the first entry in `ARCHITECTURE §Salon preview ↔ LS runtime material
// parity`'s "wrong shapes to avoid": *"Preview renders raw GLB materials; runtime renders
// through treeAtlasMaterial. Two materials, two implementations, drift inevitable."* Everything
// atlas-driven was therefore invisible here — bark gradient, tint base, tint jitter, the
// posterize substrate, the detail overlay, the region split — so the Grove could show a tree
// green while the slab shipped it otherwise, and did.
//
// ⭐ Now it loads the BAKED per-Look GLB and mounts the SAME shared material the map mounts,
// stamped by the SAME `stampTreeVertexAttrs` the Salon, the Diorama, the impostor capture and
// the Meteorologist already share. No new implementation — the Grove was simply the one
// surface nobody connected to it.
function Tile({ variant, position, opacity = 1, inLook, hovered, selected, onHoverIn, onHoverOut, onSelect,
                atlas, material, lookId, barkUniforms }) {
  const { speciesId, normalizeScale, position: posOv, rotation: rotOv, quality, excluded, speciesLabel, variantId } = variant
  // ⛔ The baked GLB, not the published one — this is what the map loads.
  const url = bakedGlbUrl(lookId, speciesId, variantId)
  const { scene } = useGLTF(url)
  // Clone so each tile has its own scene graph (drei caches by URL).
  const cloned = useMemo(() => scene.clone(true), [scene])

  // Mirror SpecimenViewport's stamping block exactly (same helper, same fallbacks, same
  // chassis-wide scan) so the Grove, the Salon and the map read one tree the same way.
  // ⛔ This tile's OWN material — never the Look's shared one; see cloneTreeMaterial.
  const treeMaterial = material || null
  const gradientSlot = barkUniforms?.gradientByVariant
    ? (barkUniforms.gradientByVariant[variantId] ?? barkUniforms.gradientByVariant[String(variantId)] ?? null)
    : null
  useMemo(() => {
    if (!treeMaterial) return
    let chMinY = Infinity, chMaxY = -Infinity
    const geoms = []
    cloned.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      if (bb) { chMinY = Math.min(chMinY, bb.min.y); chMaxY = Math.max(chMaxY, bb.max.y) }
      geoms.push(o.geometry)
    })
    const chassisMinY = Number.isFinite(chMinY) ? chMinY : 0
    const chassisYRange = Math.max(1e-4, chMaxY - chMinY)
    const chassisRadius = measureChassisRadius(geoms)
    cloned.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      if (o.geometry) {
        stampTreeVertexAttrs(o.geometry, { chassisMinY, chassisYRange, chassisRadius }, o)
        // Vertex colors flip USE_COLOR and would compile a parallel program; the shared
        // material expects none. (Same reason as SpecimenViewport.)
        if (o.geometry.attributes?.color) o.geometry.deleteAttribute('color')
      }
      o.material = treeMaterial
      // ⭐ PER-DRAW bark uniforms. The Salon can bind these in a useFrame because it shows ONE
      // species; the Grove shows ten against ONE shared material, so the values must be written
      // immediately before this tile's draw — exactly what `InstancedTrees` does, and for the
      // same reason (its comment: "the prior draw's species values are still on the uniforms").
      // ⛔ ALWAYS CALL IT — never skip on "this species has nothing authored".
      // `applyBarkUniforms(mat, null, …)` RESETS the uniforms to identity
      // (treeAtlasMaterial.js:1996); an early return leaves the PREVIOUS draw's species on
      // the shared material. Three.js sorts opaque meshes by distance, so draw order changes
      // as the camera orbits — which is how every trunk in the Grove flipped red halfway
      // round the circle: it was inheriting `acer_saccharum`'s bark gradient, the only one in
      // the atlas. Skipping the write is the fallback shape; resetting is the honest one.
      o.onBeforeRender = () => {
        applyBarkUniforms(
          treeMaterial,
          barkUniforms?.barkSettings ?? null,
          gradientSlot,
          barkUniforms?.detailSlot ?? null,
          barkUniforms?.posterizedSlot ?? null,
        )
        // ⛔ ALWAYS CALL IT, for the reason spelled out above: a null resets to
        // identity, an early return leaves the previous tile's underside bound.
        applyLeafFaceUniforms(treeMaterial, barkUniforms?.leafFace ?? null)
      }
    })
  }, [cloned, treeMaterial, barkUniforms, gradientSlot])

  // Crossfade the specimen (the Grove Hero↔Browse transition).
  // ⛔ NOT per-tile any more. Every tile now draws with the ONE shared atlas material, so
  // mutating "its" material here would mutate every other tile's too. The crossfade is a
  // GLOBAL transition (one `blend`, passed identically to all tiles), so it is applied once
  // on the shared material by the parent — see `useGroveCrossfade`.

  // Mirror Workstage's Skeleton transform stack EXACTLY. GLB-source
  // trees are already Y-up after publish-glb.js, so Workstage passes
  // forestryRotation={false} — no rotation on the primitive. Grove
  // matches that, otherwise operator rotation overrides double-up.
  const { centerX, centerZ, groundOffset } = useMemo(() => {
    cloned.rotation.set(0, 0, 0)
    cloned.updateMatrixWorld(true)
    const trunk = computeDominantTrunk(cloned)
    if (!trunk) return { centerX: 0, centerZ: 0, groundOffset: 0 }
    return { centerX: -trunk.x, centerZ: -trunk.z, groundOffset: -trunk.minY }
  }, [cloned])

  const [px, py, pz] = position
  const ox = posOv?.x ?? 0, oy = posOv?.y ?? 0, oz = posOv?.z ?? 0
  const rx = rotOv?.x ?? 0, ry = rotOv?.y ?? 0, rz = rotOv?.z ?? 0
  // ⛔ SCALE IS ALREADY IN THE BAKED GLB. `bake-look` applies
  // `scaleOverride ?? normalizeScale` to the bytes so the runtime renders at 1:1
  // (bake-look.js:1377 → rewriteGLB's `scale` arg). The published GLB does NOT carry it,
  // which is why this used to multiply by `normalizeScale` — re-applying it now would
  // double every tree.
  //
  // ⛔ AND THE 82% SHRINK IS GONE (Jacob, 2026-08-26: "Nobody asked for that, it doesn't
  // even make sense"). It rendered an unselected tile at 0.82 with a base circle at 0.22
  // opacity — invisible on the pale ground — so trees appeared with no circle and read as
  // strays. It dates to e5d69a86 (2026-04-30) and was never requested. Under the Grove
  // invariant there is no "available but not selected" tier to encode: a tree in the Grove
  // is baked and slab-ready, or it is not in the Grove.
  const effScale = 1
  const baseColor = QUALITY_COLOR[quality] || '#666'

  return (
    <group position={[px, py, pz]}>
      {/* Tile base — color = quality. Click selects the tile (opens the
          fixed editor panel); hover is a light highlight preview only.
          e.delta rejects an orbit drag registering as a click. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn() }}
        onPointerOut={onHoverOut}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 5) return; onSelect() }}
      >
        <circleGeometry args={[TILE_SPACING * 0.42, 48]} />
        <meshStandardMaterial
          color={excluded ? '#3a3a3a' : baseColor}
          opacity={(excluded ? 0.35 : ((hovered || selected) ? 0.95 : 0.78)) * opacity}
          transparent
          roughness={0.85}
        />
      </mesh>

      {/* Selection highlight — a bright ring so the panel's binding to a
          tile is unambiguous in the 3D scene. */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[TILE_SPACING * 0.44, TILE_SPACING * 0.5, 48]} />
          <meshBasicMaterial color="#bce0a0" transparent opacity={0.95 * opacity} toneMapped={false} />
        </mesh>
      )}

      {/* Stack mirrors SpecimenViewport's Skeleton (rotation → scale →
          positionOverride → trunk auto-center). The forestry rotation is
          set on the scene root above; primitive below renders it as-is. */}
      <group rotation={[rx, ry, rz]}>
        <group scale={[effScale, effScale, effScale]}>
          <group position={[ox, oy, oz]}>
            <group position={[centerX, groundOffset, centerZ]}>
              <primitive object={cloned} />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

// Fixed editor rail for the click-selected tile. Anchored to the Grove
// chrome (right side of the gallery), so it never chases the camera the
// way the old tile-anchored Html card did. Per
// feedback_focus_one_over_grid_for_3d_inspection: a focused panel beats
// a grid of transient hover-cards.
function GroveEditorPanel({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary, isCanary, onClose }) {
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 320,
      background: 'rgba(16,16,20,0.97)',
      borderLeft: '3px solid ' + (inLook ? '#5a8a5a' : 'rgba(255,255,255,0.15)'),
      boxShadow: '-6px 0 24px rgba(0,0,0,0.45)',
      zIndex: 4, display: 'flex', flexDirection: 'column',
      color: '#ddd', fontFamily: '-apple-system, sans-serif', fontSize: 12,
    }}>
      <div style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Editor</span>
        <button onClick={onClose} title="Close (or click empty space)" style={{
          marginLeft: 'auto', background: 'transparent', border: 'none',
          color: '#aaa', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
        }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <EditorCard
          variant={variant}
          inLook={inLook}
          activeLookId={activeLookId}
          activeLookName={activeLookName}
          onSetOverride={onSetOverride}
          onToggleInLook={onToggleInLook}
          onSetMeteorologistCanary={onSetMeteorologistCanary}
          isCanary={isCanary}
        />
      </div>
    </div>
  )
}

// Editor body for the selected tile — rating, category, notes, Look
// membership, canary. Rendered inside the fixed GroveEditorPanel (no
// longer a tile-anchored Html card), so it carries no positioning
// chrome of its own. All edits go through setGroveVariantOverride /
// toggleInLook (POST + optimistic local update).
function EditorCard({ variant, inLook, activeLookId, activeLookName, onSetOverride, onToggleInLook, onSetMeteorologistCanary, isCanary }) {
  const { speciesId, speciesLabel, variantId, quality, category, excluded, operatorNotes } = variant
  const [notes, setNotes] = useState(operatorNotes || '')
  useEffect(() => { setNotes(operatorNotes || '') }, [speciesId, variantId, operatorNotes])

  const setQuality = (q) => onSetOverride('qualityOverride', q)
  const setCategory = (c) => onSetOverride('categoryOverride', c === category ? null : c)
  const saveNotes = () => onSetOverride('operatorNotes', notes.trim() ? notes : null)

  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <strong style={{ color: '#fff' }}>{speciesLabel}</strong>
        <span style={{ color: '#888', fontSize: 11 }}>· v{variantId}</span>
        {excluded && (
          <span style={{
            marginLeft: 'auto', color: '#e88', fontSize: 10,
            letterSpacing: '0.08em',
          }}>EXCLUDED</span>
        )}
      </div>

      {/* Rating ladder — 3 buttons covering the in-runtime tiers */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>rating</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { n: 2, label: 'Fill', dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 3, label: 'Mid',  dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 4, label: 'Hero', dark: '#5a8a3a', light: '#6a9a4a' },
          ].map(({ n, label, dark, light }) => {
            const active = quality === n
            return (
              <button key={n} onClick={() => setQuality(n)}
                style={{
                  flex: 1, padding: '5px 4px', borderRadius: 3, fontSize: 11,
                  background: active ? dark : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : '#aaa',
                  border: '1px solid ' + (active ? light : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{label}</button>
            )
          })}
        </div>
      </div>

      {/* Category — single select, click to toggle override */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CATEGORIES.map(c => {
            const on = category === c
            return (
              <button key={c} onClick={() => setCategory(c)}
                style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 10,
                  background: on ? '#3a5a8a' : 'rgba(255,255,255,0.05)',
                  color: on ? '#fff' : '#888',
                  border: '1px solid ' + (on ? '#4a6a9a' : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{c}</button>
            )
          })}
        </div>
      </div>

      {/* Notes — textarea, blur saves */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="quirks, manual fixes…"
          style={{
            width: '100%', minHeight: 40, resize: 'vertical', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#ddd', borderRadius: 3, padding: '5px 7px',
            fontFamily: 'inherit', fontSize: 11,
          }}
        />
      </div>

      {/* Toggle membership in active Look — adds when not in, removes when in. */}
      <button
        disabled={!activeLookId}
        onClick={onToggleInLook}
        title={
          !activeLookId ? 'No Look active' :
          inLook        ? `Remove from ${activeLookName || 'this Look'}` :
                          `Add to ${activeLookName || 'this Look'}`
        }
        style={{
          width: '100%',
          padding: '6px 10px', borderRadius: 3,
          background: !activeLookId
            ? 'rgba(255,255,255,0.04)'
            : (inLook ? 'rgba(154,74,74,0.3)' : 'rgba(74,134,74,0.3)'),
          border: '1px solid ' + (
            !activeLookId ? 'rgba(255,255,255,0.08)' :
            inLook        ? '#9a4a4a' : '#5a8a5a'
          ),
          color: !activeLookId ? '#666' : (inLook ? '#f0c0c0' : '#c0e0a8'),
          fontFamily: 'inherit', fontSize: 11,
          cursor: activeLookId ? 'pointer' : 'default',
          letterSpacing: '0.04em',
        }}>
        {!activeLookId
          ? 'No Look active'
          : (inLook
              ? `Remove from ${activeLookName || 'Look'}`
              : `Add to ${activeLookName || 'Look'}`)}
      </button>

      {/* ⭐ IT STATES, THEN IT OFFERS. When this variant IS the canary the control
          says so and stops inviting a click that would do nothing; otherwise it
          reads as the action. One element, two states — a separate "current
          canary" line would be a second place the same fact lives. */}
      <button
        onClick={isCanary ? undefined : onSetMeteorologistCanary}
        disabled={isCanary}
        title={isCanary
          ? 'This variant is the canary — the Meteorologist scene and the street specimen both follow it'
          : "Set as the canary tree shown in Meteorologist's CanaryScene"}
        style={{
          width: '100%', marginTop: 6,
          padding: '6px 10px', borderRadius: 3,
          background: isCanary ? 'rgba(140,200,120,0.14)' : 'rgba(255,255,255,0.04)',
          border: isCanary ? '1px solid rgba(140,200,120,0.55)' : '1px solid rgba(255,255,255,0.12)',
          color: isCanary ? '#bce0a0' : '#c8c0e0',
          fontFamily: 'inherit', fontSize: 11,
          letterSpacing: '0.04em',
          cursor: isCanary ? 'default' : 'pointer',
        }}>
        {isCanary ? '✓ This is the canary' : '→ Set as Meteorologist canary'}
      </button>
    </div>
  )
}

const overlayMsg = {
  position: 'absolute', top: '40%', left: 0, right: 0,
  textAlign: 'center', color: '#888', fontSize: 13,
  pointerEvents: 'none', zIndex: 2,
}

function btn() {
  return {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ccc', padding: '5px 10px', borderRadius: 4,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
  }
}
