import { create } from 'zustand'
import { fetchMarkers, saveMarkers, fetchCenterlines, saveCenterlines, fetchMeasurements, saveMeasurements } from '../api.js'

const useCartographStore = create((set, get) => ({
  // ── Layer visibility + colors (synced from Panel.jsx) ─────
  layerVis: {},
  layerColors: {},
  luColors: {},
  bgColor: '#1a1a18',

  // ── Map visibility (global, crosses all modes) ────────────
  // Both fills and aerial are orientation toggles, not styling — they live
  // in the toolbar alongside each other, not in the design panel.
  fillsVisible: true,
  toggleFills: () => set(s => ({ fillsVisible: !s.fillsVisible })),

  aerialVisible: true,
  toggleAerial: () => set(s => ({ aerialVisible: !s.aerialVisible })),

  // ── Mode ──────────────────────────────────────────────────
  // mode = the workspace (null | 'surveyor' | 'measure' | 'stage')
  // markerActive = overlay toggle, independent of mode
  mode: null,
  markerActive: false,
  setMode: (newMode) => {
    const prev = get().mode
    if (prev === newMode) {
      // Toggle off → back to default view
      set({ mode: null, status: '' })
      if (prev === 'surveyor') {
        get()._saveCenterlines()
        set({ selectedStreet: null, selectedNode: null })
      }
      return
    }
    // Entering a mode — exit previous first
    if (prev === 'surveyor') {
      get()._saveCenterlines()
      set({ selectedStreet: null, selectedNode: null })
    }
    if (newMode === 'surveyor') {
      set({ mode: 'surveyor', status: 'Click a street to select. Drag nodes to edit. Space to pan.' })
    } else if (newMode === 'measure') {
      set({ mode: 'measure', status: 'Click a street to adjust its cross-section.' })
    } else if (newMode === 'stage') {
      set({ mode: 'stage', status: '' })
    }
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
  svOriginals: new Map(),
  selectedStreet: null,
  selectedNode: null,

  _loadCenterlines: async () => {
    try {
      const data = await fetchCenterlines()
      const cd = data && data.streets ? data : { streets: [] }
      const originals = new Map()
      for (const st of cd.streets) {
        originals.set(st.id, st._original || st.points.map(p => [p[0], p[1]]))
      }
      set({ centerlineData: cd, svOriginals: originals })
    } catch { /* ignore */ }
  },
  _saveCenterlines: () => {
    saveCenterlines(get().centerlineData)
  },
  // Per-street undo history: map of streetIdx → array of snapshots
  _undoStacks: {},

  _pushUndo: (streetIdx) => {
    const st = get().centerlineData.streets[streetIdx]
    if (!st) return
    const stacks = { ...get()._undoStacks }
    if (!stacks[streetIdx]) stacks[streetIdx] = []
    // Snapshot current state
    stacks[streetIdx].push({
      points: st.points.map(p => [p[0], p[1]]),
      hiddenNodes: [...(st.hiddenNodes || [])],
      disabled: !!st.disabled,
    })
    // Cap at 50 entries
    if (stacks[streetIdx].length > 50) stacks[streetIdx].shift()
    set({ _undoStacks: stacks })
  },

  undoStreet: () => {
    const { selectedStreet, centerlineData, _undoStacks } = get()
    if (selectedStreet === null) return
    const stack = _undoStacks[selectedStreet]
    if (!stack || !stack.length) return
    const snap = stack.pop()
    const st = centerlineData.streets[selectedStreet]
    st.points = snap.points
    st.hiddenNodes = snap.hiddenNodes
    st.disabled = snap.disabled
    set({
      centerlineData: { ...centerlineData },
      _undoStacks: { ..._undoStacks },
      selectedNode: null,
      status: 'Undo (' + stack.length + ' left)',
    })
    get()._saveCenterlines()
  },

  selectStreet: (idx) => set({ selectedStreet: idx, selectedNode: null }),
  selectNode: (idx) => set({ selectedNode: idx }),
  deselectStreet: () => set({ selectedStreet: null, selectedNode: null }),

  updateStreetField: (field, value) => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    get()._pushUndo(selectedStreet)
    centerlineData.streets[selectedStreet][field] = value
    set({ centerlineData: { ...centerlineData } })
    get()._saveCenterlines()
  },

  moveNode: (streetIdx, nodeIdx, x, z) => {
    const { centerlineData } = get()
    centerlineData.streets[streetIdx].points[nodeIdx] = [x, z]
    set({ centerlineData: { ...centerlineData } })
  },

  // Push undo snapshot before a drag starts (called from onPointerDown)
  beginDrag: (streetIdx) => {
    get()._pushUndo(streetIdx)
  },

  toggleNodeHidden: (nodeIdx) => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    get()._pushUndo(selectedStreet)
    const st = centerlineData.streets[selectedStreet]
    if (!st.hiddenNodes) st.hiddenNodes = []
    const hIdx = st.hiddenNodes.indexOf(nodeIdx)
    if (hIdx >= 0) st.hiddenNodes.splice(hIdx, 1)
    else st.hiddenNodes.push(nodeIdx)
    set({ centerlineData: { ...centerlineData }, selectedNode: null })
    get()._saveCenterlines()
  },

  toggleStreetDisabled: () => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    get()._pushUndo(selectedStreet)
    const st = centerlineData.streets[selectedStreet]
    st.disabled = !st.disabled
    set({ centerlineData: { ...centerlineData }, selectedStreet: null, selectedNode: null })
    get()._saveCenterlines()
  },

  revertStreet: () => {
    const { selectedStreet, centerlineData } = get()
    if (selectedStreet === null) return
    get()._pushUndo(selectedStreet)
    const st = centerlineData.streets[selectedStreet]
    if (!st._original) return
    st.points = st._original.map(p => [p[0], p[1]])
    st.hiddenNodes = []
    st.disabled = false
    set({
      centerlineData: { ...centerlineData },
      selectedNode: null,
      status: 'Reverted: ' + st.name + ' (' + st._original.length + ' pts)',
    })
    get()._saveCenterlines()
  },

  splitAtNode: () => {
    const { selectedStreet, selectedNode, centerlineData } = get()
    if (selectedStreet === null || selectedNode === null) return
    const st = centerlineData.streets[selectedStreet]
    if (selectedNode === 0 || selectedNode === st.points.length - 1) return // can't split at endpoints

    // Two new segments, both keep the same street identity
    const ptsA = st.points.slice(0, selectedNode + 1)
    const ptsB = st.points.slice(selectedNode)

    const baseId = st.id || st.name + '-' + selectedStreet
    const segA = {
      ...st,
      id: baseId + '-a',
      points: ptsA,
      _original: ptsA.map(p => [p[0], p[1]]),
      hiddenNodes: [],
    }
    const segB = {
      ...st,
      id: baseId + '-b',
      points: ptsB,
      _original: ptsB.map(p => [p[0], p[1]]),
      hiddenNodes: [],
    }

    // Replace the original street with the two segments
    const streets = [...centerlineData.streets]
    streets.splice(selectedStreet, 1, segA, segB)

    set({
      centerlineData: { ...centerlineData, streets },
      selectedStreet: null,
      selectedNode: null,
      status: 'Split ' + st.name + ' at node ' + selectedNode + ' → 2 segments',
    })
    get()._saveCenterlines()
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
