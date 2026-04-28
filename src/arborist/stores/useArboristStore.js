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
      pickedTreeIds: new Set(),
      pickedDirty: false,
      selectedTreeId: null,
    })
    if (id) {
      get().loadSpecimens(id)
      get().loadSeedlings(id)
    }
  },

  // ── Workstage: specimen list + picks ─────────────────────────
  specimens: [],                // [{treeId, treeH, dataset, dataType, fileSize, recommended, ...}]
  specimensError: null,
  recommendCount: 10,
  pickedTreeIds: new Set(),     // Set<treeId>; the currently picked seedlings (in-memory)
  pickedDirty: false,           // edits since last save
  selectedTreeId: null,         // which row is loaded in the 3D viewport
  saving: false,
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
  loadSeedlings: async (id) => {
    try {
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}/seedlings`)
      if (r.ok) {
        const d = await r.json()
        const ids = new Set((d.seedlings || []).map(s => s.treeId))
        set({ pickedTreeIds: ids, pickedDirty: false })
      } else if (r.status === 404) {
        // No seedlings saved yet — start clean.
        set({ pickedTreeIds: new Set(), pickedDirty: false })
      }
    } catch { /* network fail; leave defaults */ }
  },
  selectSpecimen: (treeId) => set({ selectedTreeId: treeId }),
  togglePick: (treeId) => set(s => {
    const next = new Set(s.pickedTreeIds)
    next.has(treeId) ? next.delete(treeId) : next.add(treeId)
    return { pickedTreeIds: next, pickedDirty: true }
  }),
  pickAllRecommended: () => set(s => {
    const next = new Set(s.pickedTreeIds)
    for (const sp of s.specimens) if (sp.recommended) next.add(sp.treeId)
    return { pickedTreeIds: next, pickedDirty: true }
  }),
  clearPicks: () => set({ pickedTreeIds: new Set(), pickedDirty: true }),
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
      set({ bakeRunning: false, bakeMs: d.ms, bakeLog: d.log || null })
      // Refresh /species so the bakedAt + variants count updates.
      get().loadSpecies()
    } catch (err) {
      set({ bakeRunning: false, bakeError: String(err) })
    }
  },

  saveSeedlings: async () => {
    const s = get()
    const id = s.activeSpeciesId
    if (!id) return
    set({ saving: true })
    try {
      // Build per-seedling rows from the picked tree IDs. Default tune
      // params come from arborist/config.json — surfaced in the (future)
      // Tune panel for per-seedling overrides.
      const specimensById = new Map(s.specimens.map(sp => [sp.treeId, sp]))
      const seedlings = [...s.pickedTreeIds].map((treeId, i) => {
        const sp = specimensById.get(treeId) || {}
        return {
          id: i + 1,
          treeId,
          treeH: sp.treeH ?? null,
          sourceFile: sp.sourceFile || `botanica/dev/${treeId}.laz`,
          label: '',
          tuneParams: { voxelSize: 0.02, minRadius: 0.005, tipRadius: 0.01 },
        }
      })
      const r = await fetch(`/api/arborist/species/${encodeURIComponent(id)}/seedlings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedlings }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      set({ pickedDirty: false, saving: false })
      // Refresh /species so the Library view shows the new seedlingsPicked count.
      get().loadSpecies()
    } catch (err) {
      console.warn('[arborist] save failed:', err)
      set({ saving: false })
    }
  },
}))

export default useArboristStore
