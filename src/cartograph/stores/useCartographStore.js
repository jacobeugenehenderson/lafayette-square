import { create } from 'zustand'
import { fetchMarkers, saveMarkers, fetchCenterlines, fetchSkeleton, fetchMeasurements, saveMeasurements, fetchOverlay, saveOverlay, bakeSvg } from '../api.js'
import ribbonsData from '../../data/ribbons.json'

const useCartographStore = create((set, get) => ({
  // ── Layer visibility + colors (synced from Panel.jsx) ─────
  // Hydrated from overlay.design once /overlay loads. Panel.jsx watches
  // _designHydrated to copy these into its local state on first arrival
  // and to gate save calls so hydration itself doesn't echo a write.
  layerVis: {},
  layerColors: {},
  layerStrokes: {},
  luColors: {},
  openSections: {},
  bgColor: '#1a1a18',
  _designHydrated: false,

  // ── Map visibility (global, crosses all modes) ────────────
  // Both fills and aerial are orientation toggles, not styling — they live
  // in the toolbar alongside each other, not in the design panel.
  fillsVisible: true,
  toggleFills: () => set(s => ({ fillsVisible: !s.fillsVisible })),

  // Background view: aerialVisible=false → curated SVG cartograph,
  // aerialVisible=true → aerial photo. Same in pure Design and in tools.
  // Ribbons + tool affordances always render on top of either background.
  // AerialTiles stays mounted regardless so tiles preload in the
  // background; this flag only gates render.
  aerialVisible: false,
  toggleAerial: () => set(s => ({ aerialVisible: !s.aerialVisible })),
  setAerialVisible: (v) => set({ aerialVisible: !!v }),

  // Bake state. The cartograph's publish step (Designer → Stage) writes
  // public/cartograph-ground.svg from ribbons.json. `bakeStale` flips
  // true on every authoring edit; `bakeRunning` gates the Stage button
  // and drives the modal. After a successful bake we navigate to Hero.
  bakeRunning: false,
  bakeStale: true,           // true on app boot — never baked yet this session
  bakeLastMs: null,
  bakeError: null,
  markBakeStale: () => set({ bakeStale: true }),
  runBake: async () => {
    if (get().bakeRunning) return
    set({ bakeRunning: true, bakeError: null })
    try {
      const r = await bakeSvg()
      set({ bakeRunning: false, bakeStale: false, bakeLastMs: r.ms })
      // Hand off to Hero on success — the cartograph is published, the
      // operator wants to see the result.
      get().setShot('hero')
    } catch (err) {
      set({ bakeRunning: false, bakeError: String(err.message || err) })
    }
  },

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
          // Operator can hide individual chains (echo hunting, suppress OSM
          // junk centerlines). Hidden chains still appear in Measure (dim,
          // re-selectable) so you can toggle them back on.
          disabled: !!ov?.disabled,
          measure: ov?.measure ?? legacy?.measure,
          segmentMeasures: ov?.segmentMeasures ?? legacy?.segmentMeasures,
          // Effective cap = overlay (operator) > legacy (centerlines.json) >
          // ribbons.json (what derive.js actually rendered). The fallback
          // chain keeps the Survey dropdown in sync with the viewer when an
          // overlay/legacy entry is missing or stripped of caps. `null` from
          // an overlay or legacy entry is an explicit "no cap" and wins over
          // any underlying ribbons.json default — only `undefined` falls
          // through.
          capStart: ov && 'capStart' in ov ? ov.capStart
            : legacy && 'capStart' in legacy ? legacy.capStart
            : rb?.capEnds?.start ?? null,
          capEnd: ov && 'capEnd' in ov ? ov.capEnd
            : legacy && 'capEnd' in legacy ? legacy.capEnd
            : rb?.capEnds?.end ?? null,
          // Baseline = ribbons.json default. Save logic uses this to detect
          // operator overrides to null (suppressing an auto cap).
          _baselineCapStart: rb?.capEnds?.start ?? null,
          _baselineCapEnd: rb?.capEnds?.end ?? null,
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

      // Hydrate design (layer visibility/colors/strokes/land-use colors) from
      // the overlay's design block. Always set _designHydrated so Panel begins
      // saving subsequent user edits — even when the overlay had no design yet.
      const design = (overlay && overlay.design) || {}
      set({
        centerlineData: { streets },
        svOriginals: originals,
        corridorByIdx,
        layerVis: design.layerVis || {},
        layerColors: design.layerColors || {},
        layerStrokes: design.layerStrokes || {},
        luColors: design.luColors || {},
        openSections: design.openSections || {},
        _designHydrated: true,
      })
    } catch (e) { console.warn('[skeleton] load failed:', e) }
  },

  // Persistence write path. Builds the skelId-keyed overlay JSON from
  // current centerlineData state and POSTs to /overlay. Streets without
  // any authored intent (no measure/segmentMeasures/caps/couplers) are
  // omitted so the overlay file stays compact. Called by every authoring
  // action after the in-memory state is updated.
  _saveOverlay: () => {
    const { centerlineData, layerVis, layerColors, layerStrokes, luColors, openSections, _designHydrated } = get()
    // Refuse to write while the store is in its uninitialized state — saving
    // an empty streets/design dict here clobbers operator edits in
    // overlay.json. The store reaches uninitialized state on real boot
    // (before _loadCenterlines completes) AND on Vite HMR of this module
    // (state resets to defaults but no remount of CartographApp re-fires
    // _loadCenterlines). In both cases an immediate save would wipe disk.
    if (!centerlineData.streets || centerlineData.streets.length === 0) {
      console.warn('[overlay] save aborted: centerlineData not loaded')
      return
    }
    if (!_designHydrated) {
      console.warn('[overlay] save aborted: design not hydrated')
      return
    }
    // Any save = the SVG bake is now stale. The Stage button shows it,
    // the modal re-runs on next click. (Cheap to flip; doesn't auto-bake.)
    if (!get().bakeStale) set({ bakeStale: true })
    const out = {}
    for (const st of centerlineData.streets || []) {
      if (!st.id) continue
      const hasMeasure = !!st.measure
      const hasSegM = st.segmentMeasures && Object.keys(st.segmentMeasures).length > 0
      const capStart = st.capStart ?? null
      const capEnd = st.capEnd ?? null
      const baseStart = st._baselineCapStart ?? null
      const baseEnd = st._baselineCapEnd ?? null
      // Persist caps when the operator state differs from the ribbons.json
      // baseline (including explicit override-to-null) OR when there's any
      // non-null cap to remember.
      const hasCaps = capStart !== baseStart || capEnd !== baseEnd || !!capStart || !!capEnd
      const hasCouplers = Array.isArray(st.couplers) && st.couplers.length > 0
      // Anchor is persisted only when it differs from the auto-detected
      // default (from ribbons.json). _autoAnchor is set on load.
      const hasAnchorOverride = st.anchor && st.anchor !== (st._autoAnchor || 'center')
      const hasDisabled = !!st.disabled
      if (!hasMeasure && !hasSegM && !hasCaps && !hasCouplers && !hasAnchorOverride && !hasDisabled) continue
      out[st.id] = {
        name: st.name,
        ...(hasMeasure ? { measure: st.measure } : {}),
        ...(hasSegM ? { segmentMeasures: st.segmentMeasures } : {}),
        ...(hasCaps ? { capStart, capEnd } : {}),
        ...(hasCouplers ? { couplers: st.couplers } : {}),
        ...(hasAnchorOverride ? { anchor: st.anchor } : {}),
        ...(hasDisabled ? { disabled: true } : {}),
      }
    }
    const design = { layerVis, layerColors, layerStrokes, luColors, openSections }
    saveOverlay({ version: 1, streets: out, design })
  },
  // Debounced save for design-panel edits. Color pickers fire `onInput` many
  // times per drag; coalesce to a single network write 300 ms after the last
  // change. Centerline edits keep using _saveOverlay directly.
  _saveDesignDebounced: (() => {
    let t = null
    return () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => { t = null; get()._saveOverlay() }, 300)
    }
  })(),
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

  // Toggle a chain's `disabled` flag. Disabled chains stop contributing
  // ribbon geometry, edge strokes, silhouette, AND face-clip — but stay
  // selectable in Measure (dimmed) so the operator can re-enable.
  setStreetDisabled: (streetIdx, disabled) => {
    const { centerlineData } = get()
    const st = centerlineData.streets[streetIdx]
    if (!st) return
    const streets = centerlineData.streets.map((s, i) =>
      i === streetIdx ? { ...s, disabled: !!disabled } : s
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

// Vite HMR resilience: reloading this module resets the store to initial
// defaults, but CartographApp's _loadCenterlines effect (deps []) doesn't
// re-fire on a store-only HMR. Re-trigger the load so design + centerlines
// rehydrate from overlay.json, instead of sitting in the empty-guard state
// until the next full page reload.
if (import.meta.hot) {
  import.meta.hot.accept()
  if (typeof window !== 'undefined') {
    useCartographStore.getState()._loadCenterlines()
    useCartographStore.getState()._loadMarkers?.()
    useCartographStore.getState()._loadMeasurements?.()
  }
}
