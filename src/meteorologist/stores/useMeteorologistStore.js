/**
 * Meteorologist UI store — Phase 1 scaffold.
 *
 * Tracks: current mode (Teapot vs Conditions), the two library payloads,
 * active selection (console-logged only in Phase 1), and the shared Look
 * picker (mirrors arborist). Workstage/autosave plumbing lands in Phase 2.
 */
import { create } from 'zustand'
import useTimeOfDay from '../../hooks/useTimeOfDay'
import {
  NAMED_TOD_SLOTS_BY_ID, getTodSlotMinutes, todSlotAtMinute,
  resolveGroupAtMinute,
} from '../../cartograph/animatedParam.js'

const ACTIVE_LOOK_KEY = 'meteorologist-active-look'

// One-field channel ('value'). Mirrors createGroupChannelActions in
// useCartographStore.js, scoped to a per-cloud, per-param channel rather
// than a per-Look channel. Same shape — same resolver downstream.
const FIELD_KEYS = ['value']
const FIELD_DEFAULTS = { value: 0 }

function flatTuple(channel) {
  return { value: channel?.values?.value == null ? 0 : Number(channel.values.value) }
}

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

  // ── Selection ────────────────────────────────────────────────
  // activePresetId set → MeteorologistApp routes to Teacup.
  // activeConditionId routing lands in Phase 3.
  activePresetId: null,
  activeConditionId: null,
  setActivePreset: (id) => {
    // Flush any pending save before switching presets so the slider value
    // the operator just released doesn't get clobbered by an unrelated
    // PUT in flight. (Per feedback_debounced_save_must_flush_before_dependent_post.)
    get()._flushPendingSaves()
    set({ activePresetId: id })
  },
  setActiveCondition: (id) => {
    console.log('setActiveCondition(', id, ')')
    set({ activeConditionId: id })
  },

  presetById: (id) => get().presets.find(p => p.id === id),

  // ── Per-cloud-param channel mutations (autosave-debounced) ──
  //
  // The channel data shape on disk is the same `{ values, animated?,
  // transitionIn?, transitionOut? }` form used by Stage's TodChannel
  // primitive. These actions mutate in-memory `presets` and schedule a
  // debounced PUT through savePreset.
  //
  // Pattern mirrors createGroupChannelActions in useCartographStore.js,
  // but scoped to one (presetId, paramKey) channel rather than a
  // per-Look group. One field per channel — key 'value'.
  _patchParam: (presetId, paramKey, mutate) => {
    set(s => {
      const idx = s.presets.findIndex(p => p.id === presetId)
      if (idx < 0) return s
      const cur = s.presets[idx]
      const nextChannel = mutate(cur.params?.[paramKey])
      if (nextChannel === undefined) return s
      const nextPreset = {
        ...cur,
        params: { ...(cur.params || {}), [paramKey]: nextChannel },
      }
      const nextPresets = s.presets.slice()
      nextPresets[idx] = nextPreset
      return { presets: nextPresets }
    })
    get()._scheduleSave(presetId)
  },

  // Set the current value. If flat → mutate values.value. If animated →
  // mutate the slot at the playhead (matches TodChannel editability gating).
  setCloudParam: (presetId, paramKey, value) => {
    get()._patchParam(presetId, paramKey, (ch) => {
      const cur = ch || { values: { value: 0 } }
      if (!cur.animated) {
        return { ...cur, values: { ...(cur.values || {}), value: Number(value) } }
      }
      const tod = useTimeOfDay.getState()
      const sid = todSlotAtMinute(tod.getMinuteOfDay(), tod.currentTime)
      if (!sid || !(sid in (cur.values || {}))) return undefined
      const tuple = { ...(cur.values[sid] || {}), value: Number(value) }
      return { ...cur, values: { ...cur.values, [sid]: tuple } }
    })
  },

  animateCloudParam: (presetId, paramKey, slotId) => {
    if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
    get()._patchParam(presetId, paramKey, (ch) => {
      if (ch?.animated) return undefined
      const seed = flatTuple(ch)
      return {
        animated: 'tod',
        transitionIn: 30,
        transitionOut: 30,
        values: { [slotId]: seed },
      }
    })
  },

  unanimateCloudParam: (presetId, paramKey) => {
    get()._patchParam(presetId, paramKey, (ch) => {
      if (!ch?.animated) return undefined
      const tod = useTimeOfDay.getState()
      const phId = todSlotAtMinute(tod.getMinuteOfDay(), tod.currentTime)
      const slotIds = Object.keys(ch.values || {})
      const useId = phId && slotIds.includes(phId) ? phId : slotIds[0]
      const tuple = useId ? ch.values[useId] : { ...FIELD_DEFAULTS }
      return { values: { ...tuple } }
    })
  },

  addCloudParamSlot: (presetId, paramKey, slotId) => {
    if (!slotId || !NAMED_TOD_SLOTS_BY_ID[slotId]) return
    const slotMinutes = getTodSlotMinutes(useTimeOfDay.getState().currentTime)
    const minute = slotMinutes[slotId]
    if (minute == null) return
    get()._patchParam(presetId, paramKey, (ch) => {
      if (!ch?.animated) return undefined
      if (slotId in (ch.values || {})) return undefined
      const seed = resolveGroupAtMinute(ch, minute, slotMinutes, FIELD_KEYS, FIELD_DEFAULTS)
      return { ...ch, values: { ...ch.values, [slotId]: seed } }
    })
  },

  removeCloudParamSlot: (presetId, paramKey, slotId) => {
    get()._patchParam(presetId, paramKey, (ch) => {
      if (!ch?.animated || !(slotId in (ch.values || {}))) return undefined
      const values = { ...ch.values }
      const removed = values[slotId]
      delete values[slotId]
      // 0 slots remaining → collapse to flat using the removed tuple so
      // the visual at the moment of removal is preserved.
      if (Object.keys(values).length === 0) return { values: { ...removed } }
      return { ...ch, values }
    })
  },

  setCloudParamTransition: (presetId, paramKey, side, minutes) => {
    get()._patchParam(presetId, paramKey, (ch) => {
      if (!ch?.animated) return undefined
      const m = Math.max(0, Number(minutes) || 0)
      return side === 'in' ? { ...ch, transitionIn: m } : { ...ch, transitionOut: m }
    })
  },

  // ── Autosave plumbing ────────────────────────────────────────
  // Per-preset debounce: rapid edits across multiple params on one cloud
  // coalesce into a single PUT after 500ms idle. Saves to different presets
  // are independent timers — switching clouds mid-edit flushes the prior
  // one (see setActivePreset / _flushPendingSaves).
  _saveTimers: {},
  _pendingPresets: new Set(),
  _scheduleSave: (presetId) => {
    if (!presetId) return
    const timers = get()._saveTimers
    if (timers[presetId]) clearTimeout(timers[presetId])
    get()._pendingPresets.add(presetId)
    timers[presetId] = setTimeout(() => {
      delete timers[presetId]
      get()._pendingPresets.delete(presetId)
      get()._savePresetNow(presetId)
    }, 500)
  },
  _flushPendingSaves: () => {
    const timers = get()._saveTimers
    const pending = [...get()._pendingPresets]
    for (const id of pending) {
      if (timers[id]) { clearTimeout(timers[id]); delete timers[id] }
      get()._savePresetNow(id)
    }
    get()._pendingPresets.clear()
  },
  _savePresetNow: async (presetId) => {
    const preset = get().presetById(presetId)
    if (!preset) return
    try {
      const r = await fetch(`/api/meteorologist/presets/${encodeURIComponent(presetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        console.warn('[meteorologist] preset save failed:', err)
        set({ presetsError: err.error || `HTTP ${r.status}` })
      }
    } catch (err) {
      console.warn('[meteorologist] preset save failed:', err)
      set({ presetsError: String(err) })
    }
  },
  // Public alias for Phase 4 (flush before any dependent POST).
  savePreset: async (presetId) => get()._savePresetNow(presetId),

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
