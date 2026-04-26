import { create } from 'zustand'
import { fetchMarkers, saveMarkers, fetchCenterlines, fetchSkeleton, fetchMeasurements, saveMeasurements, fetchOverlay, saveOverlay } from '../api.js'
import ribbonsData from '../../data/ribbons.json'

const useCartographStore = create((set, get) => ({
  // ── Layer visibility + colors (synced from Panel.jsx) ─────
  layerVis: {},
  layerColors: {},
  layerStrokes: {},
  luColors: {},
  bgColor: '#1a1a18',

  // ── Map visibility (global, crosses all modes) ────────────
  // Both fills and aerial are orientation toggles, not styling — they live
  // in the toolbar alongside each other, not in the design panel.
  fillsVisible: true,
  toggleFills: () => set(s => ({ fillsVisible: !s.fillsVisible })),

  // ── Tool + Shot ───────────────────────────────────────────
  // Two orthogonal axes:
  //   tool = authoring tool, only meaningful in the Designer (shot==='designer')
  //          (null | 'surveyor' | 'measure').  null = neutral "Design" state.
  //   shot = which camera/environment preset is active
  //          ('designer' | 'browse' | 'hero' | 'street')
  // markerActive = overlay toggle, independent of tool
  tool: null,
  shot: (() => {
    try {
      const saved = localStorage.getItem('cartograph-shot')
      if (saved && ['designer', 'browse', 'hero', 'street'].includes(saved)) return saved
    } catch { /* ignore */ }
    return 'designer'
  })(),
  // Scene = what geometry we're looking at. Orthogonal to tool and shot.
  // 'neighborhood' = real Lafayette Square data. 'toy' = compact test fixture
  // (single 4-way corner, 4 blocks of houses) for shader + rendering R&D.
  scene: (() => {
    try {
      const saved = localStorage.getItem('cartograph-scene')
      if (saved === 'toy' || saved === 'neighborhood') return saved
    } catch { /* ignore */ }
    return 'neighborhood'
  })(),
  setScene: (scene) => {
    if (scene !== 'neighborhood' && scene !== 'toy') return
    try { localStorage.setItem('cartograph-scene', scene) } catch { /* ignore */ }
    set({ scene })
  },
  markerActive: false,
  setTool: (newTool) => {
    const prev = get().tool
    if (prev === newTool) {
      set({ tool: null, status: '' })
      if (prev === 'surveyor') set({ selectedStreet: null, selectedNode: null })
      return
    }
    if (prev === 'surveyor') set({ selectedStreet: null, selectedNode: null })
    if (newTool === 'surveyor') {
      set({ tool: 'surveyor', status: 'Click a street to inspect.' })
    } else if (newTool === 'measure') {
      set({ tool: 'measure', status: 'Click a street to adjust its cross-section.' })
    } else {
      set({ tool: null, status: '' })
    }
  },
  setShot: (shot) => {
    if (get().shot === 'designer' && shot !== 'designer') {
      set({ tool: null, selectedStreet: null, selectedNode: null, markerActive: false, markerEraserActive: false })
    }
    try { localStorage.setItem('cartograph-shot', shot) } catch { /* ignore */ }
    set({ shot, status: '' })
  },
  toggleMarker: () => {
    const cur = get().markerActive
    set({
      markerActive: !cur,
      markerEraserActive: cur ? false : get().markerEraserActive,
      status: cur ? '' : 'Draw on the map to mark areas.',
    })
  },

  markerEraserActive: false,
  toggleMarkerEraser: () => {
    const on = !get().markerEraserActive
    set({
      markerEraserActive: on,
      status: on ? 'Click a stroke to erase it.' : 'Draw on the map to mark areas.',
    })
  },

  // ── Status ────────────────────────────────────────────────
  status: '',
  setStatus: (status) => set({ status }),

  // ── Space key (pan override) ──────────────────────────────
  spaceDown: false,
  setSpaceDown: (v) => set({ spaceDown: v }),

  // ── Cursor (set by overlays on hover) ─────────────────────
  hoverTarget: false,
  setHoverTarget: (v) => set({ hoverTarget: v }),

  // ── Copied profile (for measure paste) ────────────────────
  _copiedProfile: null,

  // ── Marker ────────────────────────────────────────────────
  markerStrokes: [],
  _loadMarkers: async () => {
    try {
      const data = await fetchMarkers()
      set({ markerStrokes: Array.isArray(data) ? data : [] })
    } catch { /* ignore */ }
  },
  addMarkerStroke: (stroke) => {
    const strokes = [...get().markerStrokes, stroke]
    set({ markerStrokes: strokes, status: strokes.length + ' stroke(s)' })
    saveMarkers(strokes)
  },
  undoMarkerStroke: () => {
    const strokes = get().markerStrokes.slice(0, -1)
    set({ markerStrokes: strokes, status: strokes.length ? strokes.length + ' stroke(s)' : '' })
    saveMarkers(strokes)
  },
  clearMarkerStrokes: () => {
    set({ markerStrokes: [], status: 'Cleared.' })
    saveMarkers([])
  },
  deleteMarkerStroke: (idx) => {
    const strokes = get().markerStrokes
    if (idx < 0 || idx >= strokes.length) return
    const next = strokes.slice(0, idx).concat(strokes.slice(idx + 1))
    set({ markerStrokes: next, status: next.length ? next.length + ' stroke(s)' : '' })
    saveMarkers(next)
  },

  // ── Surveyor ──────────────────────────────────────────────
  centerlineData: { streets: [] },
  corridorByIdx: new Map(),
  selectedStreet: null,
  selectedNode: null,
  // Measure mode: where on the selected centerline the user clicked.
  // Handles anchor to this point instead of the street midpoint.
  selectedMeasurePoint: null,

  // Load streets from skeleton.json. Skeleton is the geometric source of
  // truth — regeneratable from OSM. Non-geometric operator intent (caps,
  // couplers, measurements) currently back-filled from legacy
  // centerlines.json by name; a proper overlay file is TBD.
  _loadCenterlines: async () => {
    try {
      const [skel, legacy, overlay] = await Promise.all([
        fetchSkeleton(),
        fetchCenterlines().catch(() => ({ streets: [] })),
        fetchOverlay().catch(() => ({ version: 1, streets: {} })),
      ])
      const skelStreets = (skel && skel.streets) || []
      const legacyStreets = (legacy && legacy.streets) || []
      const overlayById = (overlay && overlay.streets) || {}

      // Build name → legacy entry map for fallback migration only. Couplers
      // are intentionally ignored (point-index-based, tied to stale geometry).
      // Score prefers entries with the richest remaining authored data.
      const byName = new Map()
      const score = (s) => (s.measure ? 8 : 0)
        + (s.segmentMeasures ? 4 : 0)
        + ((s.capStart || s.capEnd) ? 1 : 0)
      for (const ls of legacyStreets) {
        if (!ls.name) continue
        const prev = byName.get(ls.name)
        if (!prev || score(ls) > score(prev)) byName.set(ls.name, ls)
      }

      // Skeleton owns id/geometry/highway/oneway/couplers (geometric ones);
      // overlay (skelId-keyed) owns measure, segmentMeasures, caps, anchor
      // override, and any operator-authored couplers. Legacy centerlines.json
      // is fallback only, matched by name — used to seed the overlay on first
      // run. anchor + innerSign + pairId are auto-detected by derive.js for
      // divided carriageways and forwarded via ribbons.json.
      const ribbonById = new Map((ribbonsData.streets || []).map(r => [r.skelId, r]))
      const streets = skelStreets.map((s) => {
        const ov = overlayById[s.id]
        const legacy = ov ? null : byName.get(s.name)
        const rb = ribbonById.get(s.id)
        return {
          id: s.id,
          name: s.name,
          type: s.highway || 'residential',
          oneway: !!s.oneway,
          points: (s.points || []).map(p => [p.x, p.z]),
          divided: !!s.divided,
          measure: ov?.measure ?? legacy?.measure,
          segmentMeasures: ov?.segmentMeasures ?? legacy?.segmentMeasures,
          capStart: ov?.capStart ?? legacy?.capStart,
          capEnd: ov?.capEnd ?? legacy?.capEnd,
          couplers: ov?.couplers ?? s.couplers ?? [],
          // Anchor: operator override wins; otherwise auto-detected from
          // derive's divided-pair pass. innerSign and pairId always come
          // from auto-detection (geometric, not operator intent).
          anchor: ov?.anchor ?? rb?.anchor ?? 'center',
          _autoAnchor: rb?.anchor ?? 'center',
          innerSign: rb?.innerSign ?? 0,
          pairId: rb?.pairId ?? null,
          _skeleton: s,
          _legacyMatched: !!legacy,
        }
      })

      const matchedNames = new Set(streets.filter(s => s._legacyMatched).map(s => s.name))
      const orphans = legacyStreets.filter(ls =>
        ls.name && !matchedNames.has(ls.name) && score(ls) > 0)
      if (orphans.length) {
        console.warn(`[skeleton] ${orphans.length} legacy centerlines with operator intent have no skeleton match:`,
          orphans.map(o => `${o.name} (${score(o)})`))
      }

      const originals = new Map()
      for (const st of streets) originals.set(st.id, st.points.map(p => [p[0], p[1]]))

      // Build corridor lookup: for each skeleton street id, the SET of
      // street indices that belong to the same corridor. Click any one
      // chain → the whole corridor lights up. The corridor is the
      // "these chains are one road" link (two divided carriageways +
      // their bidirectional continuation are one corridor).
      const corridorByIdx = new Map() // streetIdx → Set<streetIdx>
      const idToIdx = new Map(streets.map((s, i) => [s.id, i]))
      for (const corridor of (ribbonsData.corridors || [])) {
        const members = new Set()
        for (const phase of corridor.phases) {
          for (const cid of phase.chainIds) {
            const idx = idToIdx.get(cid)
            if (idx !== undefined) members.add(idx)
          }
        }
        for (const idx of members) corridorByIdx.set(idx, members)
      }

      set({ centerlineData: { streets }, svOriginals: originals, corridorByIdx })
    } catch (e) { console.warn('[skeleton] load failed:', e) }
  },

  // Persistence write path. Builds the skelId-keyed overlay JSON from
  // current centerlineData state and POSTs to /overlay. Streets without
  // any authored intent (no measure/segmentMeasures/caps/couplers) are
  // omitted so the overlay file stays compact. Called by every authoring
  // action after the in-memory state is updated.
  _saveOverlay: () => {
    const { centerlineData } = get()
    const out = {}
    for (const st of centerlineData.streets || []) {
      if (!st.id) continue
      const hasMeasure = !!st.measure
      const hasSegM = st.segmentMeasures && Object.keys(st.segmentMeasures).length > 0
      const hasCaps = !!(st.capStart || st.capEnd)
      const hasCouplers = Array.isArray(st.couplers) && st.couplers.length > 0
      // Anchor is persisted only when it differs from the auto-detected
      // default (from ribbons.json). _autoAnchor is set on load.
      const hasAnchorOverride = st.anchor && st.anchor !== (st._autoAnchor || 'center')
      if (!hasMeasure && !hasSegM && !hasCaps && !hasCouplers && !hasAnchorOverride) continue
      out[st.id] = {
        name: st.name,
        ...(hasMeasure ? { measure: st.measure } : {}),
        ...(hasSegM ? { segmentMeasures: st.segmentMeasures } : {}),
        ...(hasCaps ? { capStart: st.capStart || null, capEnd: st.capEnd || null } : {}),
        ...(hasCouplers ? { couplers: st.couplers } : {}),
        ...(hasAnchorOverride ? { anchor: st.anchor } : {}),
      }
    }
    saveOverlay({ version: 1, streets: out })
  },
  // Back-compat alias for older callers that still invoke _saveCenterlines.
  _saveCenterlines: () => { get()._saveOverlay() },

  // Override the anchor for a street ('center' | 'inner-edge'). Auto-detection
  // sets a default at load time; this lets the operator override per chain.
  // Persists to overlay only when the override differs from the auto value.
  setAnchor: (streetIdx, anchor) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, anchor } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Active segment ordinal (0 = first segment, 1 = second, ...) for the
  // selected street in measure mode. Ordinal keys are stable across coord
  // systems (skeleton vs. ribbons polylines), unlike point-index ranges.
  selectedSegmentOrdinal: null,
  selectStreet: (idx) => set({ selectedStreet: idx, selectedNode: null, selectedSegmentOrdinal: null }),
  selectNode: (idx) => set({ selectedNode: idx }),
  deselectStreet: () => set({ selectedStreet: null, selectedNode: null, selectedMeasurePoint: null, selectedSegmentOrdinal: null }),
  setMeasurePoint: (pt) => set({ selectedMeasurePoint: pt }),
  setSegmentOrdinal: (ord) => set({ selectedSegmentOrdinal: ord }),

  // In-memory only. These writes don't persist — the overlay file that
  // will back caps / couplers / measure is TBD. Current callers
  // (SurveyorPanel, MeasurePanel) mutate centerlineData for live feedback;
  // edits evaporate on reload.
  updateStreetField: (field, value) => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    const streets = centerlineData.streets.map((s, i) =>
      i === selectedStreet ? { ...s, [field]: value } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Toggle a coupler at the given point index on the selected street.
  // Couplers carry world coords (x, z) so they re-project onto whichever
  // polyline a consumer is indexing (skeleton vs. ribbons differ in vertex
  // count). Endpoints can't be couplers — they're already chain boundaries.
  //
  // segmentMeasures is keyed by ordinal segment index (0 = first segment,
  // 1 = second, ...). Adding a coupler splits one segment into two: both new
  // ordinals inherit the parent's measure. Removing a coupler merges two
  // adjacent segments into one: the merged ordinal inherits the lower
  // (leftmost) segment's measure.
  toggleCoupler: (streetIdx, pointIdx) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const n = st.points.length
    if (pointIdx <= 0 || pointIdx >= n - 1) return
    const cur = (st.couplers || []).map(c => typeof c === 'number'
      ? { kind: 'split', pointIdx: c, x: st.points[c]?.[0], z: st.points[c]?.[1] }
      : c)
    const has = cur.findIndex(c => c.pointIdx === pointIdx) >= 0
    const next = has
      ? cur.filter(c => c.pointIdx !== pointIdx)
      : [...cur, { kind: 'split', pointIdx, x: st.points[pointIdx][0], z: st.points[pointIdx][1] }]
    next.sort((a, b) => a.pointIdx - b.pointIdx)

    // Map old ordinals → new ordinals to migrate segmentMeasures.
    const idxsBefore = cur.filter(c => c.kind === 'split').map(c => c.pointIdx).sort((a, b) => a - b)
    const idxsAfter = next.filter(c => c.kind === 'split').map(c => c.pointIdx).sort((a, b) => a - b)
    const oldSm = st.segmentMeasures || {}
    const newSm = {}
    if (idxsAfter.length === idxsBefore.length + 1) {
      // Added one coupler. The split ordinal is where the new index appears.
      const added = idxsAfter.find(i => !idxsBefore.includes(i))
      const splitOrd = idxsAfter.indexOf(added) // both new segments share this old ordinal
      for (let oldOrd = 0; oldOrd <= idxsBefore.length; oldOrd++) {
        const v = oldSm[String(oldOrd)]
        if (!v) continue
        if (oldOrd < splitOrd) newSm[String(oldOrd)] = v
        else if (oldOrd === splitOrd) {
          newSm[String(splitOrd)] = v
          newSm[String(splitOrd + 1)] = { left: { ...v.left }, right: { ...v.right }, symmetric: v.symmetric }
        } else newSm[String(oldOrd + 1)] = v
      }
    } else if (idxsAfter.length === idxsBefore.length - 1) {
      // Removed one coupler. The two segments at ordinal R and R+1 merge
      // into one new ordinal R, which inherits old R's measure.
      const removed = idxsBefore.find(i => !idxsAfter.includes(i))
      const mergeOrd = idxsBefore.indexOf(removed) // old ordinal of left half
      for (let oldOrd = 0; oldOrd <= idxsBefore.length; oldOrd++) {
        const v = oldSm[String(oldOrd)]
        if (!v) continue
        if (oldOrd <= mergeOrd) newSm[String(oldOrd)] = v
        else if (oldOrd === mergeOrd + 1) continue // dropped (merged into mergeOrd)
        else newSm[String(oldOrd - 1)] = v
      }
    } else {
      // No structural change — copy as-is.
      Object.assign(newSm, oldSm)
    }
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, couplers: next, segmentMeasures: newSm } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // Write a per-segment measure override, keyed by ordinal segment index.
  // Seeds from the supplied fallback measure on first edit so the segment
  // forks cleanly from chain default.
  setSegmentMeasure: (streetIdx, ordinal, updater, seedFrom) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const key = String(ordinal)
    const sm = st.segmentMeasures || {}
    const cur = sm[key] || (seedFrom
      ? { left: { ...seedFrom.left }, right: { ...seedFrom.right }, symmetric: !!seedFrom.symmetric }
      : null)
    if (!cur) return
    updater(cur)
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, segmentMeasures: { ...sm, [key]: cur } } : s
    )
    set({ centerlineData: { ...centerlineData, streets } })
    get()._saveOverlay()
  },

  // ── Measurements ──────────────────────────────────────────
  measurements: [],
  selectedMeasurement: null, // { id, type, which?, index? }

  _loadMeasurements: async () => {
    try {
      const data = await fetchMeasurements()
      const ms = ((data && data.measurements) || []).map(m => {
        const ts = m.ts || []
        const mats = m.materials && m.materials.length === ts.length + 1
          ? m.materials
          : new Array(ts.length + 1).fill('none')
        return { ...m, ts, materials: mats }
      })
      set({ measurements: ms })
    } catch { /* ignore */ }
  },
  _saveMeasurements: () => {
    saveMeasurements({ measurements: get().measurements })
  },
  addMeasurement: (m) => {
    const ms = [...get().measurements, m]
    set({ measurements: ms })
    saveMeasurements({ measurements: ms })
  },
  deleteMeasurement: (id) => {
    const ms = get().measurements.filter(m => m.id !== id)
    const sel = get().selectedMeasurement
    set({
      measurements: ms,
      selectedMeasurement: sel && sel.id === id ? null : sel,
    })
    saveMeasurements({ measurements: ms })
  },
  updateMeasurementName: (id, name) => {
    const ms = get().measurements
    const m = ms.find(x => x.id === id)
    if (m) m.name = name
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },
  updateMeasurementMaterial: (id, segIdx, matId) => {
    const ms = get().measurements
    const m = ms.find(x => x.id === id)
    if (m) {
      if (!m.materials) m.materials = new Array((m.ts || []).length + 1).fill('none')
      m.materials[segIdx] = matId
    }
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },
  setSelectedMeasurement: (sel) => set({ selectedMeasurement: sel }),

  moveMeasurementPoint: (id, which, x, z) => {
    // which: 'p1' | 'p2'
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) { m[which] = { x, z } }
    set({ measurements: [...ms] })
  },

  moveMeasurementWaypoint: (id, wpIdx, t) => {
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) {
      m.ts[wpIdx] = Math.max(0.001, Math.min(0.999, t))
      m.ts.sort((a, b) => a - b)
    }
    set({ measurements: [...ms] })
  },

  addMeasurementWaypoint: (id, t) => {
    const ms = get().measurements
    const m = ms.find(v => v.id === id)
    if (m) {
      m.ts.push(t)
      m.ts.sort((a, b) => a - b)
      // Add a 'none' material for the new segment
      const segIdx = m.ts.indexOf(t)
      m.materials.splice(segIdx + 1, 0, 'none')
    }
    set({ measurements: [...ms] })
    get()._saveMeasurements()
  },

  finishMeasurementDrag: () => {
    get()._saveMeasurements()
  },
}))

export default useCartographStore

// Dev hook: expose the store on window for quick inspection.
if (typeof window !== 'undefined') window.cs = useCartographStore
