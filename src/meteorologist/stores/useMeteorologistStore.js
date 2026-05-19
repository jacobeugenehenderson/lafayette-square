/**
 * Meteorologist UI store — Phase 1 scaffold.
 *
 * Tracks: current mode (Teapot vs Conditions), the two library payloads,
 * active selection (console-logged only in Phase 1), and the shared Look
 * picker (mirrors arborist). Workstage/autosave plumbing lands in Phase 2.
 */
import { create } from 'zustand'

const ACTIVE_LOOK_KEY = 'meteorologist-active-look'

const useMeteorologistStore = create((set, get) => ({
  // ── Mode ────────────────────────────────────────────────────
  mode: 'teapot',                       // 'teapot' | 'conditions'
  setMode: (m) => set({ mode: m === 'conditions' ? 'conditions' : 'teapot' }),

  // ── Libraries ───────────────────────────────────────────────
  presets: [],
  presetsError: null,
  loadPresets: async () => {
    try {
      const r = await fetch(`/api/meteorologist/presets?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ presets: d.presets || [], presetsError: null })
    } catch (err) {
      set({ presetsError: String(err) })
    }
  },

  conditions: [],
  conditionsError: null,
  loadConditions: async () => {
    try {
      const r = await fetch(`/api/meteorologist/almanac?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      set({ conditions: d.rules || [], conditionsError: null })
    } catch (err) {
      set({ conditionsError: String(err) })
    }
  },

  // ── Selection (Phase 1: console-logged on click) ────────────
  activePresetId: null,
  activeConditionId: null,
  setActivePreset: (id) => {
    console.log('setActivePreset(', id, ')')
    set({ activePresetId: id })
  },
  setActiveCondition: (id) => {
    console.log('setActiveCondition(', id, ')')
    set({ activeConditionId: id })
  },

  // ── Looks (mirrors arborist; owned by Cartograph) ───────────
  looks: [],
  defaultLookId: null,
  activeLookId: (typeof localStorage !== 'undefined'
    ? localStorage.getItem(ACTIVE_LOOK_KEY) : null) || null,
  looksError: null,
  loadLooks: async () => {
    try {
      const r = await fetch(`/api/cartograph/looks?t=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const looks = d.looks || []
      const defaultId = d.default || null
      let active = get().activeLookId
      if (!active || !looks.some(l => l.id === active)) active = defaultId
      set({ looks, defaultLookId: defaultId, activeLookId: active, looksError: null })
      if (active && typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_LOOK_KEY, active)
      }
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
}))

export default useMeteorologistStore
