/**
 * Arborist UI store — single source of truth for which species the
 * operator is working in, the current specimen list + picks, and the
 * viewport selection. Mirrors the cartograph store's pattern (load on
 * demand, autosave debounced, derived flags).
 */
import { create } from 'zustand'

// activeLookId persists across sessions so the operator returns to the
// Look they were curating. Stored under a separate key from cartograph's
// own selection so the two apps can drift if needed.
const ACTIVE_LOOK_KEY = 'arborist-active-look'

const useArboristStore = create((set, get) => ({
  // ── Looks ────────────────────────────────────────────────────
  // Looks are owned by Cartograph (public/looks/<id>/design.json).
  // Arborist co-edits them: it lists every Look so the operator can pick
  // which one they're curating trees for, and (in pass 2) writes the
  // `trees` roster onto the active Look's design.json. The Looks
  // directory IS the shared bus — no inter-server polling needed.
  looks: [],                    // [{id, name, createdAt, updatedAt}]
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
  setGroveOpen: (open) => {
    set({ groveOpen: !!open })
    if (open) get().loadGrove()
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
    const isGlb = sp?.source === 'glb'
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
