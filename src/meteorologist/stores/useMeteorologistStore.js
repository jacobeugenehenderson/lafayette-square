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
    // Same flush-on-switch rule as setActivePreset: any in-flight
    // debounced rule save must commit before we lose the active id.
    get()._flushPendingSaves()
    set({ activeConditionId: id })
  },

  presetById:    (id) => get().presets.find(p => p.id === id),
  conditionById: (id) => get().conditions.find(c => c.id === id),

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
    // Presets
    const timers = get()._saveTimers
    const pending = [...get()._pendingPresets]
    for (const id of pending) {
      if (timers[id]) { clearTimeout(timers[id]); delete timers[id] }
      get()._savePresetNow(id)
    }
    get()._pendingPresets.clear()
    // Rules
    const rTimers = get()._ruleSaveTimers
    const rPending = [...get()._pendingRules]
    for (const id of rPending) {
      if (rTimers[id]) { clearTimeout(rTimers[id]); delete rTimers[id] }
      get()._saveRuleNow(id)
    }
    get()._pendingRules.clear()
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

  // ── Condition (rule) mutations + autosave ────────────────────
  //
  // Phase 3 keeps the existing flat almanac.schema.json shape — directive
  // numerics remain flat scalars. Phase 3b will promote selected fields
  // (sun.intensity, lightDome.ambientFloor, wind.scale, wind.dir,
  // precip.intensity) to the same TodChannel/animatableValue shape used by
  // cloud-param channels, once Phase 4's viewport can validate the
  // temporal authoring visually. See meteorologist/INTERFACE.md §5.2.

  _ruleSaveTimers: {},
  _pendingRules: new Set(),

  // Patch a rule by dot path (e.g. 'when.cloudCover', 'directive.sun.tint').
  // Pass value === undefined to remove the leaf key. Empty parent objects
  // are pruned so the rule stays minimal (matches the original almanac
  // authoring style: wildcards are absent, not [-Infinity, Infinity]).
  setRuleField: (ruleId, path, value) => {
    set(s => {
      const idx = s.conditions.findIndex(c => c.id === ruleId)
      if (idx < 0) return s
      const next = JSON.parse(JSON.stringify(s.conditions[idx]))
      const parts = path.split('.')
      const last = parts.pop()
      let cur = next
      for (const k of parts) {
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
        cur = cur[k]
      }
      if (value === undefined) {
        delete cur[last]
        // Prune empty parent objects so absence stays absence.
        let p = next, drop = []
        for (const k of parts) { drop.push([p, k]); p = p[k] }
        for (let i = drop.length - 1; i >= 0; i--) {
          const [obj, k] = drop[i]
          if (obj[k] && typeof obj[k] === 'object' && Object.keys(obj[k]).length === 0) {
            delete obj[k]
          }
        }
      } else {
        cur[last] = value
      }
      const arr = s.conditions.slice()
      arr[idx] = next
      return { conditions: arr }
    })
    get()._scheduleRuleSave(ruleId)
  },

  // Replace the rule wholesale (used by revertConditionToDefault after
  // the server writes the defaults back).
  _replaceRule: (rule) => {
    set(s => {
      const idx = s.conditions.findIndex(c => c.id === rule.id)
      if (idx < 0) return s
      const arr = s.conditions.slice()
      arr[idx] = rule
      return { conditions: arr }
    })
  },

  // directive.clouds array helpers — schema caps maxItems at 3.
  addCloudToCondition: (ruleId, presetId) => {
    const rule = get().conditionById(ruleId)
    if (!rule) return
    const cur = rule.directive?.clouds || []
    if (cur.length >= 3) return
    const next = [...cur, { preset: presetId, weight: 0.1 }]
    get().setRuleField(ruleId, 'directive.clouds', next)
  },
  removeCloudFromCondition: (ruleId, idx) => {
    const rule = get().conditionById(ruleId)
    if (!rule) return
    const cur = rule.directive?.clouds || []
    if (idx < 0 || idx >= cur.length) return
    const next = cur.filter((_, i) => i !== idx)
    // If the last cloud was removed, drop the array entirely so the
    // condition inherits whatever directive cloud blend would default
    // to. (Matches almanac.json style: empty arrays are absent.)
    if (next.length === 0) {
      get().setRuleField(ruleId, 'directive.clouds', undefined)
    } else {
      get().setRuleField(ruleId, 'directive.clouds', next)
    }
  },
  setCloudInCondition: (ruleId, idx, patch) => {
    const rule = get().conditionById(ruleId)
    if (!rule) return
    const cur = rule.directive?.clouds || []
    if (idx < 0 || idx >= cur.length) return
    const next = cur.slice()
    next[idx] = { ...cur[idx], ...patch }
    get().setRuleField(ruleId, 'directive.clouds', next)
  },
  setCloudWeight: (ruleId, idx, weight) =>
    get().setCloudInCondition(ruleId, idx, { weight: Number(weight) }),
  setCloudPreset: (ruleId, idx, presetId) =>
    get().setCloudInCondition(ruleId, idx, { preset: presetId }),

  _scheduleRuleSave: (ruleId) => {
    if (!ruleId) return
    const timers = get()._ruleSaveTimers
    if (timers[ruleId]) clearTimeout(timers[ruleId])
    get()._pendingRules.add(ruleId)
    timers[ruleId] = setTimeout(() => {
      delete timers[ruleId]
      get()._pendingRules.delete(ruleId)
      get()._saveRuleNow(ruleId)
    }, 500)
  },
  _saveRuleNow: async (ruleId) => {
    const rule = get().conditionById(ruleId)
    if (!rule) return
    try {
      const r = await fetch(`/api/meteorologist/almanac/${encodeURIComponent(ruleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        console.warn('[meteorologist] rule save failed:', err)
        set({ conditionsError: err.error || `HTTP ${r.status}` })
      }
    } catch (err) {
      console.warn('[meteorologist] rule save failed:', err)
      set({ conditionsError: String(err) })
    }
  },
  saveAlmanac: async (ruleId) => get()._saveRuleNow(ruleId),

  revertConditionToDefault: async (ruleId) => {
    // Cancel any pending edit-debounce for this rule; the server is about
    // to overwrite with defaults and we don't want a stale autosave from
    // the operator's pre-revert edits racing the response.
    const timers = get()._ruleSaveTimers
    if (timers[ruleId]) { clearTimeout(timers[ruleId]); delete timers[ruleId] }
    get()._pendingRules.delete(ruleId)
    try {
      const r = await fetch(`/api/meteorologist/almanac/${encodeURIComponent(ruleId)}/revert`, {
        method: 'POST',
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const d = await r.json()
      if (d.rule) get()._replaceRule(d.rule)
    } catch (err) {
      console.warn('[meteorologist] revert failed:', err)
      set({ conditionsError: String(err) })
    }
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
