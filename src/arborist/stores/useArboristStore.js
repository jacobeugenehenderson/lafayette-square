/**
 * Arborist UI store — single source of truth for which species the
 * operator is working in, the current specimen list + picks, and the
 * viewport selection. Mirrors the cartograph store's pattern (load on
 * demand, autosave debounced, derived flags).
 */
import { create } from 'zustand'
import { writeCanaryTree } from '../../lib/canaryTree.js'

// activeLookId persists across sessions so the operator returns to the
// Look they were curating. Stored under a separate key from cartograph's
// own selection so the two apps can drift if needed.
const ACTIVE_LOOK_KEY = 'arborist-active-look'
// salonOpen persists too (Brief 1 acceptance criterion #1) — reload while
// inside Salon returns to Salon. Mirrors the activeLookId localStorage
// pattern. The other modes (procedural/lidar/grove) intentionally do NOT
// persist; Salon does because the Salon authoring loop is the new top
// surface for v1.5, and bouncing back to Library on reload disrupts flow.
const SALON_OPEN_KEY = 'arborist-salon-open'

const useArboristStore = create((set, get) => ({
  // ── Looks ────────────────────────────────────────────────────
  // Looks are owned by Cartograph (public/looks/<id>/design.json).
  // Arborist co-edits them: it lists every Look so the operator can pick
  // which one they're curating trees for, and (in pass 2) writes the
  // `trees` roster onto the active Look's design.json. The Looks
  // directory IS the shared bus — no inter-server polling needed.
  // `scene` is the NEIGHBOURHOOD the Look is a Look of — the axis the Grove's
  // picker runs on. It equals `id` for every Look today; that is history, not a
  // constraint (see cartograph/tree-bake-inputs.mjs#sceneForLook).
  looks: [],                    // [{id, name, scene, createdAt, updatedAt}]
  defaultLookId: null,
  activeLookId:  (typeof localStorage !== 'undefined'
    ? localStorage.getItem(ACTIVE_LOOK_KEY) : null) || null,
  looksError: null,
  loadLooks: async () => {
    try {
      const r = await fetch(`/api/cartograph/looks?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const looks = d.looks || []
      const defaultId = d.default || null
      // First load: select active = persisted choice (if still exists),
      // else the default Look.
      let active = get().activeLookId
      if (!active || !looks.some(l => l.id === active)) active = defaultId
      set({ looks, defaultLookId: defaultId, activeLookId: active, looksError: null })
      if (active && typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_LOOK_KEY, active)
      }
      get().loadLooksRosters()
    } catch (err) {
      set({ looksError: String(err) })
    }
  },
  setActiveLook: (id) => {
    set({ activeLookId: id })
    if (id && typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_LOOK_KEY, id)
    }
  },

  // Rosters keyed by lookId. A variant can belong to many Looks at once,
  // so the rate panel shows a checkbox per Look. Each Look gets its own
  // debounced save so rapid multi-Look toggles don't collide.
  looksRosters: {},               // { [lookId]: [{species, variantId}] }
  looksRostersError: null,
  loadLooksRosters: async () => {
    const ids = get().looks.map(l => l.id)
    if (ids.length === 0) { set({ looksRosters: {} }); return }
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const r = await fetch(`/api/cartograph/looks/${encodeURIComponent(id)}/trees?t=${Date.now()}`)
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${id}`)
        const d = await r.json()
        return [id, d.trees || []]
      }))
      const next = {}
      for (const [id, trees] of results) next[id] = trees
      set({ looksRosters: next, looksRostersError: null })
    } catch (err) {
      set({ looksRostersError: String(err) })
    }
  },
  isInLook: (lookId, species, variantId) => {
    const list = get().looksRosters[lookId] || []
    return list.some(
      t => t.species === species && Number(t.variantId) === Number(variantId),
    )
  },
  toggleInLook: (lookId, species, variantId) => {
    if (!lookId) return
    const cur = get().looksRosters[lookId] || []
    const exists = cur.some(
      t => t.species === species && Number(t.variantId) === Number(variantId),
    )
    const next = exists
      ? cur.filter(t => !(t.species === species && Number(t.variantId) === Number(variantId)))
      : [...cur, { species, variantId: Number(variantId) }]
    set({ looksRosters: { ...get().looksRosters, [lookId]: next } })
    get()._saveLookRoster(lookId)
  },
  _saveLookRoster: async (lookId) => {
    const trees = get().looksRosters[lookId] || []
    try {
      await fetch(`/api/cartograph/looks/${encodeURIComponent(lookId)}/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trees }),
      })
      // Roster saved → fire the per-Look atlas rebake. Fire-and-forget; the
      // bake takes ~3-15s depending on roster size. Runtime cache-busts on
      // next manifest fetch so the new artifacts land when Stage/Preview reloads.
      fetch(`/api/arborist/atlas/bake?look=${encodeURIComponent(lookId)}`, {
        method: 'POST',
      }).catch(err => console.warn('[arborist] atlas auto-bake failed for', lookId, err))
    } catch (err) {
      console.warn('[arborist] roster save failed for', lookId, err)
    }
  },
  createLook: async (name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed) return null
    try {
      const r = await fetch('/api/cartograph/looks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const d = await r.json()
      await get().loadLooks()
      get().setActiveLook(d.id)
      return d.id
    } catch (err) {
      set({ looksError: String(err) })
      return null
    }
  },

  // ── Library / overall state ──────────────────────────────────
  species: [],                  // [{id,label,scientific,...,seedlingsPicked,bakedAt}]
  speciesError: null,
  activeSpeciesId: null,        // null = library view; set = workstage view
  // Grove — gallery view across the whole library. Distinct from the
  // downstream Stage app, which composes a Look from the trees the Grove
  // publishes. Naming kept separate to avoid confusion.
  groveOpen: false,
  groveVariants: [],            // flattened list from /grove
  groveError: null,
  groveLoading: false,
  grovePublishing: false,
  // Species edited in the Salon since their last publish. Autosave persists
  // compositions.json, but the Grove renders the PUBLISHED GLBs (which only
  // refresh on a generate-salon republish), so we track what needs
  // regenerating and do it on Grove entry.
  salonUnpublished: new Set(),
  setGroveOpen: (open) => {
    set({ groveOpen: !!open })
    if (open) get().enterGrove()
  },
  // Entering the Grove regenerates any Salon-edited species from source, then
  // loads — so "edit in the Salon → see it in the Grove" holds without a
  // manual Re-publish. Flushes any pending autosave first so the regenerate
  // reads current compositions.json.
  enterGrove: async () => {
    await get()._saveSalonDebounced.flush()
    const pending = [...get().salonUnpublished]
    if (pending.length) {
      set({ grovePublishing: true })
      for (const sp of pending) {
        try {
          await fetch(`/api/arborist/salon/${encodeURIComponent(sp)}/publish`, { method: 'POST' })
        } catch (e) { console.warn('[grove] republish failed for', sp, e) }
      }
      set({ salonUnpublished: new Set(), grovePublishing: false })
    }
    await get().loadGrove()
  },

  // Phase L Cycle 1 (2026-05-19) — third top-level mode alongside Grove +
  // Procedural. Routed in ArboristApp.jsx; the LidarWorkstage keeps its
  // own viewport / extraction state local (kept out of the store so toggling
  // between modes doesn't leak intermediate state across them).
  lidarOpen: false,
  setLidarOpen: (open) => {
    set({ lidarOpen: !!open })
  },

  // Shelves — the chassis-tagging gauntlet (HANDOFF-chassis-tagging-gauntlet.md):
  // ONE surface that is both the browse-all view of all 241 chassis AND the
  // habit/leaf/bark tagging gauntlet. Reached from the Salon header; routed in
  // ArboristApp.jsx. Its own full-catalog slice (`?all=1`) lives below.
  shelvesOpen: false,
  setShelvesOpen: (open) => {
    set({ shelvesOpen: !!open })
    if (open) get().loadSalonChassisCatalogAll()
  },
  salonChassisCatalogAll: [],   // [{name, morphology, heightRange, source, isForest, ...}] — ALL 241
  loadSalonChassisCatalogAll: async () => {
    try {
      const r = await fetch(`/api/arborist/salon/_all/chassis?all=1&t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ salonChassisCatalogAll: d.chassis || [] })
    } catch (err) {
      set({ salonError: String(err) })
    }
  },

  // Phase L Cycle 2 (per-region bark + bake-to-roster). Publish action drives
  // the awaited bake-tree → lidar-publish → roster-add → bake-look chain via
  // POST /api/arborist/lidar/specimen/:treeId/publish. The endpoint returns
  // when all four steps finish, so the UI's spinner faithfully reflects the
  // operator's "ready to look" moment (per the brief's explicit no-fire-and-
  // forget directive).
  lidarPublishing: false,
  lidarPublishError: null,
  publishLidarSpecimen: async ({ treeId, species, tuneParams, displayName }) => {
    set({ lidarPublishing: true, lidarPublishError: null })
    const lookId = get().activeLookId || null
    try {
      const r = await fetch(`/api/arborist/lidar/specimen/${treeId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species, lookId, tuneParams, displayName }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      set({ lidarPublishing: false })
      return d
    } catch (err) {
      set({ lidarPublishing: false, lidarPublishError: String(err.message || err) })
      throw err
    }
  },
  // Edit a variant's override field from Grove's hover card. Optimistic
  // local update + POST to the existing per-species variant override
  // endpoint. Pass value=null to clear an override (back to base).
  setGroveVariantOverride: async (speciesId, variantId, key, value) => {
    // Mirror the field changes onto the flattened grove row so the
    // hover card reflects edits immediately without waiting for a
    // /grove reload. Field-name translations: the /grove endpoint
    // exposes `quality` (resolved override-or-base), `category`
    // (resolved), `styles` (resolved), `normalizeScale` (resolved).
    const list = get().groveVariants
    const next = list.map(v => {
      if (!(v.speciesId === speciesId && v.variantId === variantId)) return v
      const updated = { ...v }
      if (key === 'qualityOverride') updated.quality = value ?? updated.quality
      else if (key === 'categoryOverride') updated.category = value ?? updated.category
      else if (key === 'stylesOverride') updated.styles = value ?? updated.styles
      else if (key === 'scaleOverride') updated.normalizeScale = value ?? updated.normalizeScale
      else if (key === 'excluded') updated.excluded = value === true
      else if (key === 'operatorNotes') updated.operatorNotes = value || ''
      return updated
    })
    set({ groveVariants: next })
    try {
      await fetch(
        `/api/arborist/species/${encodeURIComponent(speciesId)}/variants/${variantId}/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        },
      )
      // If the active workstage is this species, refresh its manifest
      // so the Workstage panel reflects what Grove just changed.
      if (get().activeSpeciesId === speciesId) {
        get().loadManifest(speciesId)
      }
    } catch (e) {
      console.warn('[arborist] grove override save failed:', e)
    }
  },
  loadGrove: async () => {
    set({ groveLoading: true, groveError: null })
    try {
      const r = await fetch(`/api/arborist/grove?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ groveVariants: d.variants || [], groveLoading: false })
    } catch (err) {
      set({ groveError: String(err), groveLoading: false })
    }
  },
  // The explicit Grove "ship-to-slab" gesture (one production move): atlas +
  // placements for the active Look. Awaited (not fire-and-forget) so the
  // button's spinner reflects the operator's "ready to look in LS" moment.
  groveBaking: false,
  groveBakeResult: null,   // { count, uniqueVariants, totalMs } | { error }
  bakeGroveToSlab: async () => {
    const lookId = get().activeLookId
    if (!lookId) { set({ groveBakeResult: { error: 'No active Look selected' } }); return }
    set({ groveBaking: true, groveBakeResult: null })
    // Flush any pending Salon autosave so the bake regenerates from current source.
    await get()._saveSalonDebounced.flush()
    try {
      const r = await fetch(`/api/arborist/grove/bake?look=${encodeURIComponent(lookId)}`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
      set({
        groveBaking: false,
        // The bake regenerates ALL composed species from source (Phase 1), so
        // nothing is unpublished afterward.
        salonUnpublished: new Set(),
        groveBakeResult: {
          count: d.placements?.count ?? 0,
          uniqueVariants: d.placements?.uniqueVariants ?? 0,
          totalMs: d.totalMs ?? 0,
        },
      })
    } catch (err) {
      set({ groveBaking: false, groveBakeResult: { error: String(err.message || err) } })
    }
  },
  // ── Procedural authoring (v1.5 Phase A — dice + adopt) ───────────────
  // Top-level mode mirroring Grove (mutually exclusive with the library /
  // Workstage / Grove views). Per-species panel lets the operator dice
  // each variant slot's seed, preview the GLB live (no file write), adopt
  // the seed to `arborist/state/<species>/seedlings.json`, then republish
  // the species through the standard pipeline.
  //
  // proceduralSeedlings is keyed by speciesId; each entry is the
  // [{slot, seed, params}] array the operator is currently editing.
  // proceduralDirtyBySpecies tracks which slot seeds diverge from what's
  // persisted on disk (so we can light up the adopt button + colored seed
  // label). Adopt clears the dirty marker for the slot.
  proceduralOpen: false,
  setProceduralOpen: (open) => {
    set({ proceduralOpen: !!open })
    if (open) {
      get().loadProceduralSpecies()
      const active = get().proceduralActiveSpecies
      if (active) get().loadProceduralSeedlings(active)
    }
  },
  proceduralActiveSpecies: 'procedural_broadleaf',
  setProceduralActiveSpecies: (s) => {
    set({ proceduralActiveSpecies: s })
    if (s) get().loadProceduralSeedlings(s)
  },
  proceduralSpeciesList: [],
  proceduralSeedlings: {},                  // { [speciesId]: [{slot, seed, params}] }
  proceduralDirtyBySpecies: {},             // { [speciesId]: { [slot]: true } }
  proceduralError: null,
  proceduralPublishing: false,
  loadProceduralSpecies: async () => {
    try {
      const r = await fetch(`/api/arborist/procedural/species?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ proceduralSpeciesList: d.species || [], proceduralError: null })
    } catch (err) {
      set({ proceduralError: String(err) })
    }
  },
  loadProceduralSeedlings: async (speciesId) => {
    try {
      const r = await fetch(`/api/arborist/procedural/${encodeURIComponent(speciesId)}/seedlings?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set(s => ({
        proceduralSeedlings: { ...s.proceduralSeedlings, [speciesId]: d.variants || [] },
        // Loading from disk clears dirty for that species — what we just
        // fetched IS the persisted state by definition.
        proceduralDirtyBySpecies: { ...s.proceduralDirtyBySpecies, [speciesId]: {} },
        proceduralError: null,
      }))
    } catch (err) {
      set({ proceduralError: String(err) })
    }
  },
  // Mutate a slot's seed in local state and mark it dirty. No file write —
  // adopt persists. Pass `seed: undefined` to roll a fresh random seed.
  setProceduralSlotSeed: (speciesId, slot, seed) => {
    set(s => {
      const list = s.proceduralSeedlings[speciesId] || []
      const next = list.map(v => v.slot === slot ? { ...v, seed } : v)
      const dirty = { ...(s.proceduralDirtyBySpecies[speciesId] || {}), [slot]: true }
      return {
        proceduralSeedlings: { ...s.proceduralSeedlings, [speciesId]: next },
        proceduralDirtyBySpecies: { ...s.proceduralDirtyBySpecies, [speciesId]: dirty },
      }
    })
  },
  diceProceduralSlot: (speciesId, slot) => {
    get().setProceduralSlotSeed(speciesId, slot, Math.floor(Math.random() * 1_000_000))
  },
  // Phase D — mutate nested params (envelope / sca / branching) for a slot.
  // paramsPatch is one-level-deep, e.g. {envelope: {profile: 'umbrella'}} or
  // {sca: {tropism: [0, -0.4, 0]}}; the merge preserves sibling fields on
  // each nested object so dragging one slider doesn't wipe the others.
  // Marks the slot dirty; the SlotCard's preview effect refetches via the
  // existing paramsKey JSON.stringify dep — no extra wiring needed.
  setProceduralSlotParams: (speciesId, slot, paramsPatch) => {
    set(s => {
      const list = s.proceduralSeedlings[speciesId] || []
      const next = list.map(v => {
        if (v.slot !== slot) return v
        const params = { ...(v.params || {}) }
        // Mirror the patch into `effective` too so controlled inputs (selects
        // without local draft state) reflect the operator's change immediately
        // instead of snapping back to the server's last-fetched effective.
        // DraftSlider keeps its own local draft, so sliders worked before;
        // selects (Profile, Phyllotaxis) didn't.
        const effective = { ...(v.effective || {}) }
        for (const k of Object.keys(paramsPatch || {})) {
          const val = paramsPatch[k]
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            params[k] = { ...(params[k] || {}), ...val }
            effective[k] = { ...(effective[k] || {}), ...val }
          } else {
            params[k] = val
            effective[k] = val
          }
        }
        return { ...v, params, effective }
      })
      const dirty = { ...(s.proceduralDirtyBySpecies[speciesId] || {}), [slot]: true }
      return {
        proceduralSeedlings: { ...s.proceduralSeedlings, [speciesId]: next },
        proceduralDirtyBySpecies: { ...s.proceduralDirtyBySpecies, [speciesId]: dirty },
      }
    })
  },
  // Clear the operator overlay for one slot, persist to disk, refetch the
  // effective fields. Equivalent to "drop the operator's deltas and snap
  // back to PRESETS defaults for this slot." Does NOT touch the slot's
  // seed (dice rolls still survive — Reset is about params, not topology).
  resetProceduralSlotParams: async (speciesId, slot) => {
    // 1. Local clear
    set(s => {
      const list = s.proceduralSeedlings[speciesId] || []
      const next = list.map(v => v.slot === slot ? { ...v, params: {} } : v)
      return {
        proceduralSeedlings: { ...s.proceduralSeedlings, [speciesId]: next },
      }
    })
    // 2. Persist (POST the whole seedlings array — same shape Adopt uses)
    const variants = get().proceduralSeedlings[speciesId] || []
    try {
      const r = await fetch(`/api/arborist/procedural/${encodeURIComponent(speciesId)}/seedlings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      // 3. Refetch so `effective` recomputes from PRESETS (server-side merge).
      await get().loadProceduralSeedlings(speciesId)
    } catch (err) {
      set({ proceduralError: String(err) })
    }
  },
  // Persist the FULL species seedlings array to disk, then clear the slot's
  // dirty marker. The endpoint writes all slots in one shot — that's the
  // shape Phase A's generator expects on republish — so adopt-one is
  // effectively "save everything but only this slot is no-longer-dirty."
  adoptProceduralSlot: async (speciesId, slot) => {
    const variants = get().proceduralSeedlings[speciesId] || []
    try {
      const r = await fetch(`/api/arborist/procedural/${encodeURIComponent(speciesId)}/seedlings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      set(s => {
        const dirty = { ...(s.proceduralDirtyBySpecies[speciesId] || {}) }
        delete dirty[slot]
        return {
          proceduralDirtyBySpecies: { ...s.proceduralDirtyBySpecies, [speciesId]: dirty },
          proceduralError: null,
        }
      })
    } catch (err) {
      set({ proceduralError: String(err) })
    }
  },
  // Republish via the publish endpoint. The endpoint shells out to
  // `node arborist/generate-procedural.js --species <id>` (writes species
  // artifacts + syncs the Look roster) and rebuilds the index. Brief 14.1
  // (Corbel) decoupled the slab bake — the endpoint no longer auto-bakes;
  // shipping to the slab is the explicit Grove gesture. The ?look= param is
  // still sent for symmetry with the Salon path but is now vestigial.
  republishProceduralSpecies: async (speciesId) => {
    set({ proceduralPublishing: true, proceduralError: null })
    const lookId = get().activeLookId
    const qs = lookId ? `?look=${encodeURIComponent(lookId)}` : ''
    try {
      const r = await fetch(
        `/api/arborist/procedural/${encodeURIComponent(speciesId)}/publish${qs}`,
        { method: 'POST' },
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      // Refresh the species list (variant counts may have changed) and the
      // seedlings (round-trips through readEffectiveSeedlings on next visit).
      get().loadSpecies?.()
      set({ proceduralPublishing: false })
    } catch (err) {
      set({ proceduralPublishing: false, proceduralError: String(err) })
    }
  },

  // ── Salon (Brief 1, Sequoia 2026-05-21) ──────────────────────────────
  // Fourth top-level mode. Chassis + bark + leaves composition surface.
  // Mirrors the procedural slice's shape (open flag, species list, per-
  // species variant overlay, dirty tracking, publish action) but the
  // payload is `compositions` instead of `seedlings`. Effective layering
  // (DEFAULTS → CHASSIS_DEFAULTS → operator overlay) is mirrored into
  // the store on patch so controlled selects reflect immediately.
  // Brief 18A (Mullion): Salon is the default Arborist surface. Initial value
  // is unconditionally true — the localStorage gate from Brief 1 is bypassed
  // because Library no longer exists as a destination. Persistence on
  // setSalonOpen below is retained so the flag remains a real piece of state
  // for 18B (e.g. source-picker that asks "is Salon active?").
  salonOpen: true,
  setSalonOpen: (open) => {
    set({ salonOpen: !!open })
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SALON_OPEN_KEY, open ? '1' : '0')
    }
    if (open) {
      get().loadSalonSpecies()
      get().loadSalonLibraries()
      get().loadSalonChassisCuration()
      const active = get().salonActiveSpecies
      if (active) get().loadSalonCompositions(active)
    }
  },
  salonActiveSpecies: null,
  setSalonActiveSpecies: (s) => {
    set({ salonActiveSpecies: s })
    if (s) {
      get().loadSalonCompositions(s)
      // Refresh the per-species dossier (+ options) for the new species — the
      // declared habit the Phase-4 picker lands on lives in salonDossier, and it
      // was only ever loaded once at mount. (Also fixes the ReferencePanel /
      // matcher options going stale on species change.)
      get().loadSalonLibraries()
    }
  },

  // ── Roster-driven Salon navigator (Brief 26, Cadastre 2026-05-25) ─────────
  // The Salon's top nav is the canonicalized park ROSTER (from GET /coverage),
  // not the library species list. Selecting a roster species resolves its
  // canonical library-species-id (a slug — the settled keying spine) and drives
  // salonActiveSpecies, so the EXISTING composition machinery authors under
  // that canonical id (state/<canonicalId>/compositions.json).
  rosterCoverage: null,            // { summary, species:[...] } from /coverage
  rosterLoading: false,
  rosterError: null,
  activeRosterName: null,          // canonical roster name of the selected row
  // The Grove build-eligibility bar (per active Look), with per-species overrides in BOTH
  // directions. ⛔ A pin alone is half a control: it can only promote. Jacob, 2026-08-25:
  // "even as I talked myself into the pin we still need a way to DISQUALIFY."
  //   pinned   — ships even BELOW the bar (the grotto's memorial tree: one placement,
  //              would never clear a demand-ordered cut, and must render anyway)
  //   withheld — never ships even ABOVE the bar (we HAVE a model and judge it not good
  //              enough — distinct from `not-available`, which means we have nothing)
  // ⭐ The immediate customer is platanus_acerifolia: a legitimate London Plane match, now
  // green, that renders BLANK (no barkDetail, both impostor bakes refused it). Without
  // `withheld` the only way to keep it out is to un-green a true statement.
  groveThreshold: { topN: null, pinned: [], withheld: [] },
  loadRosterCoverage: async () => {
    set({ rosterLoading: true, rosterError: null })
    try {
      // Scope the roster to the active Look's neighbourhood (server resolves the
      // scene via sceneForLook). Absent look → server's default scene.
      const look = get().activeLookId
      const lookQ = look ? `&look=${encodeURIComponent(look)}` : ''
      const r = await fetch(`/api/arborist/coverage?t=${Date.now()}${lookQ}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ rosterCoverage: d, rosterLoading: false })
      // The Grove build-eligibility bar is a per-Look setting; load it alongside.
      if (look) {
        try {
          const gr = await fetch(`/api/cartograph/looks/${encodeURIComponent(look)}/grove-threshold?t=${Date.now()}`)
          if (gr.ok) set({ groveThreshold: await gr.json() })
        } catch { /* non-fatal — bar defaults to no cut */ }
      }
    } catch (err) {
      set({ rosterError: String(err), rosterLoading: false })
    }
  },
  // Grove build-eligibility bar (perf lever): the top-N species by census count
  // build as their own asset; everything below substitutes to a same-category
  // built neighbour at runtime. `pinned` species stay IN even below the bar (the
  // once-appearing SPECIAL tree). Persisted per-Look in design.groveThreshold.
  setGroveTopN: (n) => {
    const gt = { ...get().groveThreshold, topN: n }
    set({ groveThreshold: gt })
    get()._saveGroveThreshold(gt)
  },
  // ⭐ THREE STATES, ONE GESTURE. Cycles neutral → pinned → withheld → neutral, because
  // those are the only three things an operator can mean about one species and the bar:
  // let the bar decide · always in · never in. A species is never in both lists.
  cycleGroveOverride: (species) => {
    const cur = get().groveThreshold
    const pinned = new Set(cur.pinned || [])
    const withheld = new Set(cur.withheld || [])
    if (pinned.has(species)) { pinned.delete(species); withheld.add(species) }
    else if (withheld.has(species)) { withheld.delete(species) }
    else { pinned.add(species) }
    const gt = { ...cur, pinned: [...pinned], withheld: [...withheld] }
    set({ groveThreshold: gt })
    get()._saveGroveThreshold(gt)
  },
  // Kept as an explicit setter for a UI that offers two affordances rather than a cycle.
  setGroveOverride: (species, state) => {
    const cur = get().groveThreshold
    const pinned = (cur.pinned || []).filter(s => s !== species)
    const withheld = (cur.withheld || []).filter(s => s !== species)
    if (state === 'pinned') pinned.push(species)
    if (state === 'withheld') withheld.push(species)
    const gt = { ...cur, pinned, withheld }
    set({ groveThreshold: gt })
    get()._saveGroveThreshold(gt)
  },
  toggleGrovePin: (species) => get().cycleGroveOverride(species),
  _saveGroveThreshold: async (gt) => {
    const look = get().activeLookId
    if (!look) return
    try {
      await fetch(`/api/cartograph/looks/${encodeURIComponent(look)}/grove-threshold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: gt.topN, pinned: gt.pinned, withheld: gt.withheld || [] }),
      })
    } catch (err) { set({ rosterError: String(err) }) }
  },
  // Select a roster row → drive the Salon onto its canonical id. The existing
  // composition slice (salonCompositions[canonicalId]) loads automatically.
  selectRosterSpecies: (row) => {
    if (!row) return
    set({ activeRosterName: row.species })
    get().setSalonActiveSpecies(row.canonicalId)
  },
  // The ONE park_species_map write (routing source of truth, roster → canonical
  // id). canonicalId → composed routing [slug]; null → not-available (empty []).
  setRosterRouting: async (rosterName, canonicalId) => {
    try {
      const body = canonicalId ? { canonicalId } : { notAvailable: true }
      const look = get().activeLookId
      const lookQ = look ? `?look=${encodeURIComponent(look)}` : ''
      const r = await fetch(`/api/arborist/coverage/${encodeURIComponent(rosterName)}/routing${lookQ}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await get().loadRosterCoverage()
    } catch (err) {
      set({ rosterError: String(err) })
    }
  },

  salonSpeciesList: [],            // [{speciesId, label, morphology, chassisCount, compositionCount}]
  salonCompositions: {},           // { [speciesId]: [{slot, name, chassis, bark, leaves, deformer, effective}] }
  salonDirtyBySpecies: {},
  salonChassisCatalog: [],         // [{name, morphology, heightRange, source, ...}]
  salonBarkRefs: [],               // ['Bark003', ...]
  salonLeafPacks: [],              // [{packId, kind}]
  salonDossier: null,              // §9 — the active species' dossier (reference plates + required) or null
  salonOptions: null,              // §9 — matcher ranked options {chassis,bark,leaf} or null
  // Brief 1.5b (Quill): operator-authored chassis curation. Keyed by
  // chassis filename (`<name>.glb`); value is `{displayName, approved, notes}`.
  // `approved` is tri-state: true/false/null (unreviewed). Absent entry is
  // equivalent to all-unreviewed. Lives in `arborist/state/_chassis-curation.json`
  // — sibling to the gitignored chassis library so it survives Brief 1.5c's
  // upcoming `survey-deleaf.js` re-run.
  salonChassisCuration: {},        // { '<name>.glb': {displayName, approved, notes} }

  loadSalonSpecies: async () => {
    try {
      const r = await fetch(`/api/arborist/salon/species?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const list = d.species || []
      set({ salonSpeciesList: list, salonError: null })
      // Default-select the first species so the workstage isn't blank on
      // first open. Doesn't override an existing active selection.
      if (list.length > 0 && !get().salonActiveSpecies) {
        get().setSalonActiveSpecies(list[0].speciesId)
      }
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  loadSalonLibraries: async () => {
    // Chassis / bark / leaves are filesystem-global; the brief routes them
    // through `:species` for shape consistency with the procedural block.
    // Use the active species id (or '_all' placeholder) as the path arg.
    const speciesArg = encodeURIComponent(get().salonActiveSpecies || '_all')
    try {
      const [cR, bR, lR, oR] = await Promise.all([
        fetch(`/api/arborist/salon/${speciesArg}/chassis?t=${Date.now()}`),
        fetch(`/api/arborist/salon/${speciesArg}/bark?t=${Date.now()}`),
        fetch(`/api/arborist/salon/${speciesArg}/leaves?t=${Date.now()}`),
        fetch(`/api/arborist/salon/${speciesArg}/options?t=${Date.now()}`),
      ])
      const [cD, bD, lD, oD] = await Promise.all([cR.json(), bR.json(), lR.json(), oR.json()])
      set({
        salonChassisCatalog: cD.chassis || [],
        salonBarkRefs:       bD.bark || [],
        salonLeafPacks:      lD.leaves || [],
        // Forest Builder §9: the dossier (reference plates + required) + the
        // matcher's ranked options per part-type for this species (null if no dossier).
        salonDossier:        oD.dossier || null,
        salonOptions:        oD.options || null,
      })
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  loadSalonChassisCuration: async () => {
    try {
      const r = await fetch(`/api/arborist/salon/curation?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ salonChassisCuration: d.chassis || {} })
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  // Optimistic update + POST. Server merges with absent-keys-preserved
  // (`feedback_absence_means_inherit_in_authored_blocks`); we mirror that
  // locally before the round-trip so the UI doesn't flicker. On HTTP
  // failure, refetch from the canonical disk state.
  setSalonChassisCuration: async (chassisName, patch) => {
    set(s => {
      const prev = s.salonChassisCuration[chassisName] || { displayName: '', approved: null, notes: '' }
      const next = { ...prev }
      if ('displayName' in patch) next.displayName = patch.displayName == null ? '' : String(patch.displayName)
      if ('approved'    in patch) next.approved    = patch.approved === true ? true : patch.approved === false ? false : null
      if ('notes'       in patch) next.notes       = patch.notes == null ? '' : String(patch.notes)
      // Chassis-tagging gauntlet: the silhouette tag (1-of-9). `null`/absent
      // clears (mirrors the server's absent-preserved / null-clears merge).
      if ('habit' in patch) next.habit = patch.habit || null
      // setAside — the exclude-from-sorts tag, kept distinct from `approved`
      // (whose false paints the Salon red). Stored only when true.
      if ('setAside' in patch) { if (patch.setAside === true) next.setAside = true; else delete next.setAside }
      const isEmpty = (!next.displayName) && next.approved == null && (!next.notes) && !next.habit && !next.setAside
      const map = { ...s.salonChassisCuration }
      if (isEmpty) delete map[chassisName]
      else map[chassisName] = next
      return { salonChassisCuration: map }
    })
    try {
      const r = await fetch(`/api/arborist/salon/curation/${encodeURIComponent(chassisName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch (err) {
      set({ salonError: String(err) })
      // Re-sync from disk so local state matches what's actually persisted.
      get().loadSalonChassisCuration()
    }
  },
  loadSalonCompositions: async (speciesId) => {
    try {
      const r = await fetch(`/api/arborist/salon/${encodeURIComponent(speciesId)}/compositions?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set(s => ({
        salonCompositions: { ...s.salonCompositions, [speciesId]: d.compositions || [] },
        salonDirtyBySpecies: { ...s.salonDirtyBySpecies, [speciesId]: {} },
        salonError: null,
      }))
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  // Mutate a slot's chassis/bark/leaves. paramsPatch is one-level-deep,
  // mirroring setProceduralSlotParams shape:
  //   {chassis: 'foo'}, {bark: {ref: 'Bark012', uvScale: [2,5]}},
  //   {leaves: {pack: 'palmate', occupancy: 0.8}}
  // The patch merges into both `params` (next disk write) and `effective`
  // (UI binding) so controlled selects don't snap back to stale server
  // state. Marks the slot dirty.
  setSalonSlotParams: (speciesId, slot, patch) => {
    set(s => {
      const list = s.salonCompositions[speciesId] || []
      const next = list.map(v => {
        if (v.slot !== slot) return v
        const params = { ...v }
        const effective = { ...(v.effective || {}) }
        for (const k of Object.keys(patch || {})) {
          const val = patch[k]
          if (k === 'chassis') {
            params.chassis = val
            effective.chassis = val
          } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            params[k]    = { ...(params[k]    || {}), ...val }
            effective[k] = { ...(effective[k] || {}), ...val }
          } else {
            params[k]    = val
            effective[k] = val
          }
        }
        return { ...v, ...params, effective }
      })
      const dirty = { ...(s.salonDirtyBySpecies[speciesId] || {}), [slot]: true }
      return {
        salonCompositions: { ...s.salonCompositions, [speciesId]: next },
        salonDirtyBySpecies: { ...s.salonDirtyBySpecies, [speciesId]: dirty },
      }
    })
    get()._saveSalonDebounced(speciesId)
  },
  setSalonSlotName: (speciesId, slot, name) => {
    set(s => {
      const list = s.salonCompositions[speciesId] || []
      const next = list.map(v => v.slot === slot ? { ...v, name } : v)
      const dirty = { ...(s.salonDirtyBySpecies[speciesId] || {}), [slot]: true }
      return {
        salonCompositions: { ...s.salonCompositions, [speciesId]: next },
        salonDirtyBySpecies: { ...s.salonDirtyBySpecies, [speciesId]: dirty },
      }
    })
    get()._saveSalonDebounced(speciesId)
  },
  addSalonSlot: (speciesId) => {
    set(s => {
      const list = s.salonCompositions[speciesId] || []
      const maxSlot = list.reduce((m, v) => Math.max(m, v.slot), 0)
      const newSlot = maxSlot + 1
      const fresh = {
        slot: newSlot,
        name: `Slot ${newSlot}`,
        chassis: null,
        bark: {},
        leaves: {},
        deformer: {},
        // Effective layered with kit DEFAULTS in the server. For the local
        // mirror we ship a sensible starting effective block so the UI's
        // controlled selects render with defaults until the operator picks
        // a chassis (the next adopt+republish will write these to disk).
        effective: {
          chassis: null,
          // Brief 1.5a: tintJitterRange migrated from hex color → numeric
          // amplitude (matches procedural BARK_BY_SPECIES + bake-look#flatten).
          // leaves.scale added — operator-tunable card-size multiplier.
          bark:    { ref: 'Bark007', uvScale: [1.5, 4], tintBase: '#ffffff', tintJitterRange: 0.08, roughnessOverride: 0.85 },
          leaves:  { pack: 'palmate', occupancy: 0.7, scale: 1.0, tintFront: '#3a7530', tintBack: '#a8b89a' },
          deformer: {},
        },
      }
      const dirty = { ...(s.salonDirtyBySpecies[speciesId] || {}), [newSlot]: true }
      return {
        salonCompositions: { ...s.salonCompositions, [speciesId]: [...list, fresh] },
        salonDirtyBySpecies: { ...s.salonDirtyBySpecies, [speciesId]: dirty },
      }
    })
    get()._saveSalonDebounced(speciesId)
  },
  resetSalonSlot: async (speciesId, slot) => {
    // Local clear: drop overlay fields, keep slot+name; re-layer effective
    // from DEFAULTS once the server re-fetches.
    set(s => {
      const list = s.salonCompositions[speciesId] || []
      const next = list.map(v => v.slot === slot
        ? { ...v, chassis: null, bark: {}, leaves: {}, deformer: {}, transform: {} }
        : v)
      return { salonCompositions: { ...s.salonCompositions, [speciesId]: next } }
    })
    const compositions = get().salonCompositions[speciesId] || []
    try {
      const r = await fetch(`/api/arborist/salon/${encodeURIComponent(speciesId)}/compositions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositions }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await get().loadSalonCompositions(speciesId)
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  adoptSalonSlot: async (speciesId, slot) => {
    const compositions = get().salonCompositions[speciesId] || []
    try {
      const r = await fetch(`/api/arborist/salon/${encodeURIComponent(speciesId)}/compositions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositions }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      set(s => {
        const dirty = { ...(s.salonDirtyBySpecies[speciesId] || {}) }
        delete dirty[slot]
        return {
          salonDirtyBySpecies: { ...s.salonDirtyBySpecies, [speciesId]: dirty },
          salonError: null,
        }
      })
    } catch (err) {
      set({ salonError: String(err) })
    }
  },
  // ── Autosave (Phase 4, 2026-06-23) ───────────────────────────────────
  // Every Salon edit (setSalonSlotParams / setSalonSlotName / addSalonSlot)
  // debounce-persists the WHOLE compositions array to
  // /salon/:species/compositions — so the operator never has to click
  // ✓ Adopt for an edit to reach disk. compositions.json is the source the
  // Grove bake regenerates from (Phase 1), so "edited → saved → ships on the
  // next bake" holds without ceremony. Mirrors _saveCurationDebounced.
  // A successful save clears the species' dirty map (the whole array is
  // persisted at once). `.flush()` fires any pending save immediately —
  // call it before any bake/publish so the source is current (the
  // feedback_debounced_save_must_flush_before_dependent_post hazard; the old
  // "Adopt-all-before-Re-publish" UI gate is replaced by this flush).
  _saveSalonDebounced: (() => {
    let t = null
    let pending = null
    const run = async (speciesId) => {
      const s = useArboristStore.getState()
      const compositions = s.salonCompositions[speciesId] || []
      try {
        const r = await fetch(`/api/arborist/salon/${encodeURIComponent(speciesId)}/compositions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ compositions }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        useArboristStore.setState(st => {
          const unpub = new Set(st.salonUnpublished); unpub.add(speciesId)
          return {
            salonDirtyBySpecies: { ...st.salonDirtyBySpecies, [speciesId]: {} },
            salonUnpublished: unpub,
            salonError: null,
          }
        })
      } catch (err) {
        useArboristStore.setState({ salonError: String(err) })
      }
    }
    const fn = (speciesId) => {
      pending = speciesId
      if (t) clearTimeout(t)
      t = setTimeout(() => { t = null; const sp = pending; pending = null; run(sp) }, 400)
    }
    fn.flush = async () => {
      if (t) { clearTimeout(t); t = null }
      if (pending) { const sp = pending; pending = null; await run(sp) }
    }
    return fn
  })(),
  // Re-publish (manual). Now largely redundant with autosave + the Phase-1
  // bake (which regenerates from source), kept until the UI strip. Flushes any
  // pending autosave first so the publish reads current source.
  republishSalonSpecies: async (speciesId) => {
    set({ salonPublishing: true, salonError: null })
    await get()._saveSalonDebounced.flush()
    const lookId = get().activeLookId
    const qs = lookId ? `?look=${encodeURIComponent(lookId)}` : ''
    try {
      const r = await fetch(
        `/api/arborist/salon/${encodeURIComponent(speciesId)}/publish${qs}`,
        { method: 'POST' },
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      get().loadSpecies?.()
      // Refresh salon species so chassisCount / compositionCount counts
      // reflect the new state.
      get().loadSalonSpecies()
      set(st => {
        const unpub = new Set(st.salonUnpublished); unpub.delete(speciesId)
        return { salonPublishing: false, salonUnpublished: unpub }
      })
    } catch (err) {
      set({ salonPublishing: false, salonError: String(err) })
    }
  },

  // Brief 8 (Linnet): writer side of the Arborist ↔ Meteorologist canary
  // contract, mirrored from Grove.jsx's per-tile affordance. Pure
  // side-effect — no state held in the store (per ARCHITECTURE.md §canary
  // contract: "useArboristStore doesn't track the canary"). The synthetic
  // dispatchEvent fires same-tab listeners; the browser already fires
  // 'storage' in OTHER same-origin tabs automatically. Composition slot N
  // maps to variantId N (matches publish-glb's emission order).
  setSalonCanary: (species, slot, lookId) => {
    writeCanaryTree({ species, variantId: slot, lookId })
  },

  loadSpecies: async () => {
    try {
      // Cache-bust: the /species response can otherwise be served from
      // browser cache after a rename + reload, hiding the new displayName.
      const r = await fetch(`/api/arborist/species?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ species: d.species || [], speciesError: null })
    } catch (err) {
      set({ speciesError: String(err) })
    }
  },
  setActiveSpecies: (id) => {
    const sp = get().species.find(s => s.id === id)
    // Procedural species are GLB-shaped: variants are pre-published by
    // `arborist/generate-procedural.js` + `publish-glb.js`, no LiDAR
    // specimens to browse. Route them through the same Workstage path.
    const isGlb = sp?.source === 'glb' || sp?.source === 'procedural'
    set({
      activeSpeciesId: id,
      specimens: [], specimensError: null,
      starredTreeIds: new Set(),
      pickedTreeIds: new Set(),
      tuneParamsByTreeId: {},
      selectedTreeId: null,
      selectedVariantId: null,
      manifest: null,
      // GLB ingest skips Cloud (no source point cloud); Skeleton mode only.
      viewMode: isGlb ? 'skeleton' : 'cloud',
      activeLod: 'lod0',
    })
    if (id) {
      get().loadManifest(id)
      // GLB-source species don't have FOR-species20K specimens to browse.
      if (!isGlb) {
        get().loadSpecimens(id)
        get().loadCuration(id)
      }
    }
  },

  // ── GLB-source state ────────────────────────────────────────
  // For 'glb' species the variants come pre-baked in the manifest; the
  // operator just previews + picks an LOD. No specimen browse, no curation.
  selectedVariantId: null,
  activeLod: 'lod0',
  selectVariant: (id) => set({ selectedVariantId: id }),
  setActiveLod:  (lod) => set({ activeLod: lod }),

  // Operator-set overrides on GLB variants. Each call optimistically updates
  // the local manifest then POSTs to the backend, which rewrites the
  // species manifest + rebuilds public/trees/index.json so the runtime
  // picker reflects the change immediately. Pass `value: null` to clear.
  // Species-level operator overrides (currently: displayName, displayNotes).
  // Updates manifest, rebuilds index, refreshes local manifest copy.
  setSpeciesOverride: async (key, value) => {
    const speciesId = get().activeSpeciesId
    const m = get().manifest
    if (!speciesId || !m) return
    const next = { ...m }
    if (value === null) delete next[key]
    else next[key] = value
    set({ manifest: next })
    try {
      await fetch(
        `/api/arborist/species/${encodeURIComponent(speciesId)}/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        },
      )
      // Refresh species list so the library view picks up new displayName.
      get().loadSpecies?.()
    } catch (e) {
      console.warn('[arborist] species override save failed:', e)
    }
  },

  setVariantOverride: async (variantId, key, value) => {
    const speciesId = get().activeSpeciesId
    const m = get().manifest
    if (!speciesId || !m) return
    set({
      manifest: {
        ...m,
        variants: m.variants.map(v => {
          if (v.id !== variantId) return v
          const next = { ...v }
          if (value === null) delete next[key]
          else next[key] = value
          return next
        }),
      },
    })
    try {
      await fetch(
        `/api/arborist/species/${encodeURIComponent(speciesId)}/variants/${variantId}/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        },
      )
    } catch (e) {
      console.warn('[arborist] override save failed:', e)
    }
  },

  // ── Inspector / viewport mode ────────────────────────────────
  // viewMode flips the workstage viewport between the source point cloud
  // (raw input) and the baked skeleton GLB (output). Both are mounted on
  // the same Three.js Canvas; the toggle is the operator's primary
  // visual feedback that bake params produced what they expected.
  manifest: null,                // public/trees/<species>/manifest.json (post-bake)
  viewMode: 'cloud',             // 'cloud' | 'skeleton'
  setViewMode: (m) => set({ viewMode: m }),
  loadManifest: async (id) => {
    try {
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}`)
      if (r.ok) {
        const m = await r.json()
        set({ manifest: m })
        // Auto-pick the first variant on load for GLB species so the viewport
        // has something to render immediately.
        if (m.source === 'glb' && m.variants?.length && !get().selectedVariantId) {
          set({ selectedVariantId: m.variants[0].id })
        }
      } else {
        set({ manifest: null })
      }
    } catch { set({ manifest: null }) }
  },

  // ── Workstage state ─────────────────────────────────────────
  specimens: [],                  // [{treeId, treeH, fileSize, recommended, ...}]
  specimensError: null,
  recommendCount: 10,

  // Two independent curation flags per specimen:
  //   starredTreeIds → free operator note. No system action. Persists.
  //   pickedTreeIds  → "checked" for publish. Becomes seedlings on save.
  //                    Bake-tree.py only processes pickedTreeIds.
  // Both autosave (debounced 300 ms) to /species/:id/seedlings as a
  // combined { starred, seedlings } payload.
  starredTreeIds: new Set(),
  pickedTreeIds:  new Set(),
  tuneParamsByTreeId: {},         // { [treeId]: { voxelSize, minRadius, tipRadius } }
  selectedTreeId: null,           // which row is loaded in the viewport
  loadSpecimens: async (id) => {
    try {
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}/specimens`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({
        specimens: d.specimens || [],
        recommendCount: d.recommendCount || 10,
        specimensError: null,
      })
      // First-look default: select the densest recommended specimen so the
      // viewport has something to render immediately.
      const firstRec = (d.specimens || [])
        .filter(s => s.recommended && s.fileSize > 0)
        .sort((a, b) => b.fileSize - a.fileSize)[0]
      if (firstRec) set({ selectedTreeId: firstRec.treeId })
    } catch (err) {
      set({ specimensError: String(err) })
    }
  },
  loadCuration: async (id) => {
    try {
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}/seedlings`)
      if (r.ok) {
        const d = await r.json()
        const seedlings = d.seedlings || []
        const tune = {}
        for (const s of seedlings) tune[s.treeId] = s.tuneParams || {}
        set({
          starredTreeIds: new Set(d.starred || []),
          pickedTreeIds:  new Set(seedlings.map(s => s.treeId)),
          tuneParamsByTreeId: tune,
        })
      } else {
        set({ starredTreeIds: new Set(), pickedTreeIds: new Set(), tuneParamsByTreeId: {} })
      }
    } catch { /* network fail; leave defaults */ }
  },
  selectSpecimen: (treeId) => set({ selectedTreeId: treeId }),
  toggleStar: (treeId) => {
    set(s => {
      const next = new Set(s.starredTreeIds)
      next.has(treeId) ? next.delete(treeId) : next.add(treeId)
      return { starredTreeIds: next }
    })
    get()._saveCurationDebounced()
  },
  togglePick: (treeId) => {
    set(s => {
      const next = new Set(s.pickedTreeIds)
      const tune = { ...s.tuneParamsByTreeId }
      if (next.has(treeId)) {
        next.delete(treeId)
        delete tune[treeId]
      } else {
        next.add(treeId)
        // Default tune params on first pick — operator overrides via the Tune panel.
        tune[treeId] = { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 }
      }
      return { pickedTreeIds: next, tuneParamsByTreeId: tune }
    })
    get()._saveCurationDebounced()
  },
  setTuneParam: (treeId, key, value) => {
    set(s => ({
      tuneParamsByTreeId: {
        ...s.tuneParamsByTreeId,
        [treeId]: { ...(s.tuneParamsByTreeId[treeId] || {}), [key]: value },
      },
    }))
    get()._saveCurationDebounced()
  },
  pickAllRecommended: () => {
    set(s => {
      const next = new Set(s.pickedTreeIds)
      const tune = { ...s.tuneParamsByTreeId }
      for (const sp of s.specimens) {
        if (!sp.recommended) continue
        if (next.has(sp.treeId)) continue
        next.add(sp.treeId)
        tune[sp.treeId] = { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 }
      }
      return { pickedTreeIds: next, tuneParamsByTreeId: tune }
    })
    get()._saveCurationDebounced()
  },
  clearPicks: () => {
    set({ pickedTreeIds: new Set(), tuneParamsByTreeId: {} })
    get()._saveCurationDebounced()
  },
  _saveCurationDebounced: (() => {
    let t = null
    return () => {
      if (t) clearTimeout(t)
      t = setTimeout(async () => {
        t = null
        const s = useArboristStore.getState()
        const id = s.activeSpeciesId
        if (!id) return
        const seedlings = [...s.pickedTreeIds].map((treeId, i) => ({
          id: i + 1,
          treeId,
          tuneParams: s.tuneParamsByTreeId[treeId] || { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 },
        }))
        try {
          await fetch(`/api/arborist/species/${encodeURIComponent(id)}/seedlings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              starred: [...s.starredTreeIds],
              seedlings,
            }),
          })
          // Refresh /species so the Library count updates without a full reload.
          s.loadSpecies()
        } catch (err) {
          console.warn('[arborist] curation save failed:', err)
        }
      }, 300)
    }
  })(),
  bakeRunning: false,
  bakeError: null,
  bakeLog: null,
  bakeMs: null,
  runBake: async () => {
    const id = get().activeSpeciesId
    if (!id) return
    set({ bakeRunning: true, bakeError: null, bakeLog: null, bakeMs: null })
    try {
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}/bake`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) {
        set({ bakeRunning: false, bakeError: d.error || `HTTP ${r.status}`, bakeLog: d.stderr || d.stdout || null })
        return
      }
      set({ bakeRunning: false, bakeMs: d.ms, bakeLog: d.log || null, viewMode: 'skeleton' })
      // Refresh both /species (Library counts) and the manifest (Inspector data).
      get().loadSpecies()
      get().loadManifest(id)
    } catch (err) {
      set({ bakeRunning: false, bakeError: String(err) })
    }
  },

}))

export default useArboristStore
