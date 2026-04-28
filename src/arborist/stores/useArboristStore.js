/**
 * Arborist UI store — single source of truth for which species the
 * operator is working in, the current specimen list + picks, and the
 * viewport selection. Mirrors the cartograph store's pattern (load on
 * demand, autosave debounced, derived flags).
 */
import { create } from 'zustand'

const useArboristStore = create((set, get) => ({
  // ── Library / overall state ──────────────────────────────────
  species: [],                  // [{id,label,scientific,...,seedlingsPicked,bakedAt}]
  speciesError: null,
  activeSpeciesId: null,        // null = library view; set = workstage view
  loadSpecies: async () => {
    try {
      const r = await fetch('/api/arborist/species')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ species: d.species || [], speciesError: null })
    } catch (err) {
      set({ speciesError: String(err) })
    }
  },
  setActiveSpecies: (id) => {
    set({
      activeSpeciesId: id,
      specimens: [], specimensError: null,
      starredTreeIds: new Set(),
      pickedTreeIds: new Set(),
      tuneParamsByTreeId: {},
      selectedTreeId: null,
      manifest: null,
      viewMode: 'cloud',
    })
    if (id) {
      get().loadSpecimens(id)
      get().loadCuration(id)
      get().loadManifest(id)
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
      if (r.ok) set({ manifest: await r.json() })
      else      set({ manifest: null })
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
