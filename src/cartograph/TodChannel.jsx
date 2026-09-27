/**
 * TodChannel — generic per-channel Time-of-Day authoring primitive.
 *
 * This is the reusable shape pulled out of LampGlowEditor once that UX was
 * locked. Any per-Look channel that wants to promote to TOD-animated rides
 * this component. Bloom (group of 3), neon glow curve (single), Sky &
 * Light gradient stops (group), per-material emissive intensities (single)
 * — all the same primitive, just different `fields` arrays.
 *
 * Channel data shape (the contract):
 *   flat:      { values: { <fieldKey>: number, … } }
 *   animated:  { animated: 'tod',
 *                values: { <slotId>: { <fieldKey>: number, … }, … },
 *                edges?: { <slotId>: { fade: 'up'|'down', minutes } } }   (animatedParam.js#edgeEnvelope)
 *
 * Single-channel callers pretend they're single-field groups (e.g. one
 * field with key 'value'). Same code path, no special case.
 *
 * The mechanic (unified 2026-06-27 — no "animate" toggle):
 *   - The 8 NAMED_TOD_SLOTS chips ALWAYS render. The edit target is simply
 *     the slot the PLAYHEAD is parked on (todSlotAtMinute) — the active
 *     chip IS that slot. There is no arm step and no sticky selection.
 *   - Playhead ON a slot → sliders LIVE. Editing writes that slot's
 *     keyframe via onSetValue(key, value, slotId); a still-flat channel is
 *     auto-converted to slot-keyed on the first edit (onFillSlot seeds it).
 *   - Playhead in a GAP (todSlotAtMinute → null) → sliders READ-ONLY,
 *     showing the resolved (tweened) value. Click a chip to scrub onto that
 *     slot and make it live.
 *   - The slot id IS the keyframe key (its time is stamped from
 *     getTodSlotMinutes), so writes never need the live clock — editing a
 *     value never jogs the timeline. The playhead moves on chip-click alone.
 *
 * Clear (was "revert"):
 *   - parked on a keyframe → remove just that keyframe (value falls back
 *     to the tween) via onRemoveSlot; removing the last keyframe collapses
 *     the channel back to flat.
 *   - otherwise → clear the whole channel to flat defaults via onRevert.
 *
 * Chip row:
 *   - All 7 chips always render. Filled = attached, dashed = empty. The
 *     playhead's slot is parked (stronger ring + bg).
 *   - Plain click (empty or filled) → scrub to that slot. No keyframe.
 *   - Right-click or ⌘/Ctrl-click on filled → onRemoveSlot.
 *
 * The internal data model is UNCHANGED — `animated:'tod'` is set
 * automatically on the first keyframe and is never surfaced as a button or
 * badge. Existing baked Looks resolve byte-identically.
 *
 * The component imports useTimeOfDay + scrubToTodSlot from the cartograph
 * store directly (universal across channels), and reads NAMED_TOD_SLOTS
 * from animatedParam (the canonical slot vocabulary).
 */
import { useState } from 'react'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCartographStore from './stores/useCartographStore.js'
import SliderRow from './SliderRow.jsx'
import {
  NAMED_TOD_SLOTS, getTodSlotLabel, todSlotAtMinute,
  getTodSlotMinutes, resolveGroupAtMinute, todEdge, TOD_FADE_DEFAULT_MIN,
} from './animatedParam.js'

// Single-letter initials. Collisions (D/S/N) are resolved by chip color
// + chronological position + tooltip carrying the full label.
const SLOT_INITIALS = {
  dawn: 'D', sunrise: 'S', noon: 'N', golden: 'G',
  sunset: 'S', dusk: 'D', night: 'N',
}

// Convert a CSS color (#hex or var(--name)) to an alpha'd value. var()
// values use color-mix so the resolved CSS variable applies at render
// time. Used by the chip + toggle styling.
function hexWithAlpha(color, alpha) {
  if (typeof color !== 'string') return `rgba(255,255,255,${alpha})`
  if (color.startsWith('var(')) {
    const pct = Math.round(alpha * 100)
    return `color-mix(in srgb, ${color} ${pct}%, transparent)`
  }
  if (color.startsWith('#')) {
    const h = color.slice(1)
    const v = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`
  }
  return color
}

// ── Slot chip ──────────────────────────────────────────────────────────────

// A marked key wears its fade: a pointed roof (fade up) or a pointed bottom (fade down).
const FADE_CLIP = {
  up:   'polygon(0 35%, 50% 0, 100% 35%, 100% 100%, 0 100%)',
  down: 'polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%)',
}

function SlotChip({ slot, attached, parked, fade, onScrub, onFill, onRemove }) {
  const baseStyle = {
    height: 18,
    padding: '0 4px',
    borderRadius: 4,
    fontSize: 'var(--type-caption)',
    lineHeight: 1,
    fontFamily: 'var(--carto-font)',
    cursor: 'pointer',
    transition: 'background 120ms, opacity 120ms, border-color 120ms',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    ...(fade ? { clipPath: FADE_CLIP[fade], height: 22 } : {}),
  }
  const filledStyle = {
    ...baseStyle,
    background: hexWithAlpha(slot.color, parked ? 0.32 : 0.18),
    border: `1px solid ${hexWithAlpha(slot.color, parked ? 1 : 0.55)}`,
    color: slot.color,
    fontWeight: parked ? 600 : 500,
  }
  const emptyStyle = {
    ...baseStyle,
    background: parked ? hexWithAlpha(slot.color, 0.10) : 'transparent',
    border: `1px dashed ${hexWithAlpha(slot.color, parked ? 0.85 : 0.30)}`,
    color: hexWithAlpha(slot.color, parked ? 0.95 : 0.55),
    fontWeight: 400,
  }
  const onClick = (e) => {
    if (attached && (e.metaKey || e.ctrlKey)) { onRemove(slot.id); return }
    return attached ? onScrub(slot.id) : onFill(slot.id)
  }
  const onContextMenu = (e) => {
    if (!attached) return
    e.preventDefault()
    onRemove(slot.id)
  }
  const title = attached
    ? `${slot.label}${parked ? ' (parked)' : ''}${fade ? ` · fades ${fade}` : ''} · right-click or ⌘-click to clear this keyframe`
    : `Jump to ${slot.label}`
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={attached ? filledStyle : emptyStyle}
      title={title}
    >
      {SLOT_INITIALS[slot.id] ?? slot.label.slice(0, 2)}
    </button>
  )
}

// ── Edge toggle — the fade at a blank tile (Jacob, 2026-09-26) ─────────────
// Only a key that borders a blank tile has one: tween (–) · fade up (▲, blank before it) · fade down (▼,
// blank after it). Pointed → its minutes show beneath, editable. animatedParam.js#edgeEnvelope is the model.

const FADE_GLYPH = { null: '–', up: '▲', down: '▼' }
const FADE_TITLE = {
  null: 'Tweens to its neighbour key, across the blank. Click to fade instead.',
  up:   'Fades UP from off, starting at this key. Click to change.',
  down: 'Fades DOWN to off, starting at this key. Click to change.',
}

function EdgeToggle({ fade, options, minutes, onChange }) {
  const next = options[(options.indexOf(fade) + 1) % options.length]
  const small = { fontSize: 'var(--type-caption)', lineHeight: 1, fontFamily: 'inherit', borderRadius: 4, width: '100%' }
  return (
    <>
      <button
        onClick={() => onChange(next, minutes)}
        title={FADE_TITLE[fade]}
        style={{ ...small, height: 14, padding: 0, cursor: 'pointer', background: 'transparent',
                 border: '1px solid var(--outline-variant)', color: fade ? 'var(--on-surface)' : 'var(--on-surface-subtle)' }}
      >{FADE_GLYPH[fade]}</button>
      {fade && (
        <input
          type="number" min={0} max={720} step={1} value={minutes}
          onChange={(e) => onChange(fade, e.target.value)}
          title="Fade length, minutes"
          className="tod-ramp-input"
          style={{ ...small, padding: '1px 0', textAlign: 'center', background: 'var(--surface-container-highest)',
                   color: 'var(--on-surface)', border: '1px solid var(--outline-variant)' }}
        />
      )}
    </>
  )
}

// ── Animation row (8 chips, each with its fade where it borders a blank) ────

function TodAnimationRow({ attachedIds, parkedSlotId, onScrub, onFill, onRemove, channel, onEdge }) {
  const order = NAMED_TOD_SLOTS.map(s => s.id), n = order.length
  return (
    <div className="flex items-start pt-1" style={{ gap: 3 }}>
      {NAMED_TOD_SLOTS.map((slot, i) => {
        const on = attachedIds.has(slot.id)
        // A single key holds — no edges. Otherwise a key borders a blank when its neighbour tile is empty.
        const blankBefore = on && attachedIds.size > 1 && !attachedIds.has(order[(i - 1 + n) % n])
        const blankAfter  = on && attachedIds.size > 1 && !attachedIds.has(order[(i + 1) % n])
        const edge = on ? todEdge(channel, slot.id) : null
        const options = [null, ...(blankBefore ? ['up'] : []), ...(blankAfter ? ['down'] : [])]
        return (
          <div key={slot.id} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SlotChip
              slot={slot}
              attached={on}
              parked={slot.id === parkedSlotId}
              fade={edge?.fade ?? null}
              onScrub={onScrub}
              onFill={onFill}
              onRemove={onRemove}
            />
            {options.length > 1 && (
              <EdgeToggle
                fade={edge?.fade ?? null}
                options={options}
                minutes={edge?.minutes ?? TOD_FADE_DEFAULT_MIN}
                onChange={(f, m) => onEdge(slot.id, f, m)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────

function ChannelSlider({ field, value, editable, onChange }) {
  return (
    <SliderRow label={field.label} value={value} min={field.min ?? 0} max={field.max} step={field.step}
      suffix={field.unit ?? ''} disabled={!editable} title={editable ? '' : 'Park on a slot to edit'}
      onChange={onChange} />
  )
}

// Toggle field — binary on/off (stored as 0 or 1). Lerping between
// slots in the resolver still produces smooth fades; the toggle just
// constrains the operator-set value to extremes. Use for channels that
// are conceptually "on or off" not "dial a level" — e.g. Milky Way
// renders or it doesn't; the cross-slot fade comes from the animator.
function ChannelToggle({ field, value, editable, onChange }) {
  const on = Number(value) >= 0.5
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{field.label}</span>
        <button
          onClick={() => editable && onChange(on ? 0 : 1)}
          disabled={!editable}
          title={editable ? '' : 'Park on a slot to edit'}
          style={{
            height: 18, padding: '0 10px', borderRadius: 4,
            fontSize: 'var(--type-caption)', lineHeight: 1,
            fontFamily: 'var(--carto-font)',
            cursor: editable ? 'pointer' : 'not-allowed',
            background: on
              ? 'color-mix(in srgb, var(--vic-gold) 22%, transparent)'
              : 'transparent',
            border: on
              ? '1px solid var(--vic-gold)'
              : '1px dashed var(--outline-variant)',
            color: on ? 'var(--vic-gold)' : 'var(--on-surface-subtle)',
            fontWeight: on ? 500 : 400,
            opacity: editable ? 1 : 0.4,
          }}
        >{on ? 'on' : 'off'}</button>
      </div>
    </div>
  )
}

// Color swatch field — peer of ChannelSlider. Uses the native picker
// (no library) so we get reliable cross-browser hex input. Same row
// shape: label on left, current hex displayed on right; swatch sits on
// the right as the click target.
function ChannelColor({ field, value, editable, onChange }) {
  const hex = (typeof value === 'string' && value[0] === '#') ? value : '#000000'
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{field.label}</span>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span className="font-mono" style={{ color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
            {hex}
          </span>
          <input
            type="color"
            value={hex}
            disabled={!editable}
            onChange={(e) => onChange(e.target.value)}
            title={editable ? '' : 'Park on a slot to edit'}
            style={{
              width: 28, height: 18, padding: 0, border: '1px solid var(--outline-variant)',
              borderRadius: 3, background: 'transparent',
              opacity: editable ? 1 : 0.4, cursor: editable ? 'pointer' : 'not-allowed',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── TodChannel (default export) ────────────────────────────────────────────

/**
 * Props:
 *   label         — heading text
 *   fields        — array of { key, label, min?, max, step }
 *   channel       — the per-Look channel object (see top-of-file contract)
 *   flatDefaults  — { fieldKey: number } fallback when channel is missing
 *   onSetValue    — (key, value) → void; called on slider change
 *   onFillSlot    — (slotId, isFirst) → void; isFirst = channel was flat
 *                   before this fill (consumer routes to animate vs add)
 *   onRemoveSlot  — (slotId) → void
 *   onSetTransition — (side: 'in'|'out', minutes) → void
 *   onRevert      — () → void; collapse to flat AND reset to flatDefaults.
 *                   Backs the "Clear" button's clear-all path (when not
 *                   parked on a keyframe). One button at the channel level
 *                   (feedback_per_item_revert), never per-slider.
 */
export default function TodChannel({
  label, fields, channel, flatDefaults,
  onSetValue, onFillSlot, onRemoveSlot, onSetTransition, onRevert,
  children,   // a control that belongs to this channel alone (e.g. Focus › Focus on), shown at the top when open
}) {
  const scrubToTodSlot = useCartographStore(s => s.scrubToTodSlot)
  const currentTime    = useTimeOfDay(s => s.currentTime)

  const animated = !!channel?.animated
  const fieldKeys = fields.map(f => f.key)
  const attachedIds = new Set(
    animated ? Object.keys(channel.values || {}) : []
  )

  // The edit target is PURELY the slot the playhead is parked on — no arm
  // step, no sticky selection. On a slot → live; in a gap → read-only. The
  // slot id is the keyframe key (its time is stamped), so writing to it never
  // needs the live clock — editing a value never jogs the timeline; the
  // playhead moves on chip-click alone (onChipClick).
  const minute = currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60
  const slotMinutes = getTodSlotMinutes(currentTime)
  const playheadSlotId = todSlotAtMinute(minute, currentTime)
  const editTarget = playheadSlotId

  // Display values + editability gate.
  //   - on a slot → show the value at that slot (its keyframe if attached,
  //     else the resolved tween / flat baseline at its minute); live.
  //   - in a gap → show the resolved value at the live minute; read-only.
  const tMin = editTarget ? (slotMinutes[editTarget] ?? minute) : minute
  // ⭐ ON A KEYED TILE THE SLIDERS SHOW THE KEY ITSELF — never the value after a fade (Jacob, 2026-09-27: a fade-up's
  // key read 0.00 on every slider, Glow size included, whose floor is 0.2, while the key held Bulb 1.92).
  const key = editTarget && channel?.animated ? channel.values?.[editTarget] : null
  const displayValues = key
    ? Object.fromEntries(fieldKeys.map(k => [k, key[k] ?? flatDefaults[k]]))
    : resolveGroupAtMinute(channel, tMin, slotMinutes, fieldKeys, flatDefaults)
  const editable = !!editTarget

  // Chip click: scrub the playhead onto that slot (which makes it the edit
  // target). Never mints a keyframe by itself.
  const onChipClick = (slotId) => scrubToTodSlot(slotId)

  // Edit routing: mint the playhead slot's keyframe on the first edit (auto-
  // converting a flat channel to slot-keyed, else adding the slot), then write
  // the field DIRECTLY to that slot. The slot id is the keyframe key (its time
  // is stamped), so the write needs no playhead — editing never jogs the
  // timeline. Off a slot the sliders are disabled, so sid is always set here.
  const onFieldChange = (key, value) => {
    const sid = editTarget
    if (!sid) return
    if (!attachedIds.has(sid)) onFillSlot(sid, !animated)
    onSetValue(key, value, sid)
  }

  // Clear: on an attached keyframe → remove just that keyframe (value falls
  // back to the tween; removing the last one collapses to flat). Otherwise →
  // clear the whole channel back to flat defaults. (Renamed from "revert".)
  const onClear = () => {
    if (animated && editTarget && attachedIds.has(editTarget)) onRemoveSlot(editTarget)
    else onRevert()
  }

  const hint = !editTarget
    ? 'Click a slot to edit — the sliders are read-only in the gaps between slots.'
    : attachedIds.has(editTarget)
      ? `Editing ${getTodSlotLabel(editTarget)} keyframe — Clear removes it.`
      : `On ${getTodSlotLabel(editTarget)} — edit a value to drop a keyframe.`

  // Per-channel revert visibility: shown when the channel is animated OR
  // any field's flat value differs from its default. Skipped if no
  // onRevert handler was provided. Lives ONLY inside the open drawer
  // (feedback_per_item_revert) — never a one-click nuke from collapsed
  // state; operator must twirl open and see what they're losing first.
  const isAtDefaults = !animated && (() => {
    const v = channel?.values || {}
    for (const f of fields) {
      const cur = Number(v[f.key])
      const def = Number(flatDefaults?.[f.key] ?? 0)
      if (Math.abs((isNaN(cur) ? def : cur) - def) > 1e-6) return false
    }
    return true
  })()
  // Clear is offered whenever there's something to clear: any keyframe
  // (animated) or a flat baseline moved off its defaults.
  const showClear = !!onRevert && (animated || !isAtDefaults)

  // Twirl-collapsible: collapsed row is just `▸ Label`.
  // Open drawer reveals sliders + Clear + the always-on chip row.
  // Default closed; component-local state (no cross-session persistence).
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderTop: '1px solid var(--outline-variant)' }}>
      {/* Collapsed-row header: chevron + label. Click anywhere on the row
          toggles. No buttons here — Clear lives inside the drawer to prevent
          accidents. (No "animated" badge: that state is now invisible — the
          chip row shows which slots carry keyframes.) */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center"
        style={{
          gap: 6, padding: '4px 0',
          background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block', width: 10,
          color: 'var(--on-surface-subtle)',
          fontSize: 'var(--type-caption)',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 120ms',
        }}>▸</span>
        <span className="text-body-sm font-medium" style={{ color: 'var(--on-surface)' }}>{label}</span>
      </button>

      {expanded && (
        <div className="space-y-2 px-2 py-2" style={{
          background: 'var(--surface-container-low, rgba(0,0,0,0.25))',
          borderRadius: 4,
          marginBottom: 4,
        }}>
          {showClear && (() => {
            const targetIsKeyframe = animated && editTarget && attachedIds.has(editTarget)
            return (
            <div className="flex items-center justify-end" style={{ gap: 6 }}>
              <button
                onClick={onClear}
                title={targetIsKeyframe
                  ? `Clear the ${getTodSlotLabel(editTarget)} keyframe (value falls back to the tween)`
                  : `Clear ${label} — back to flat defaults`}
                style={{
                  height: 18, padding: '0 6px', borderRadius: 4,
                  fontSize: 'var(--type-caption)', lineHeight: 1,
                  fontFamily: 'var(--carto-font)', cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid var(--outline-variant)',
                  color: 'var(--on-surface-subtle)',
                }}
              >{targetIsKeyframe ? '✕ clear keyframe' : '✕ clear'}</button>
            </div>
            )
          })()}

          {children}
          {fields.map(field => {
            const Comp = field.type === 'color' ? ChannelColor
              : field.type === 'toggle' ? ChannelToggle
              : ChannelSlider
            return (
              <Comp
                key={field.key}
                field={field}
                value={displayValues[field.key]}
                editable={editable}
                onChange={(v) => onFieldChange(field.key, v)}
              />
            )
          })}

          <TodAnimationRow
            attachedIds={attachedIds}
            parkedSlotId={editTarget}
            onScrub={onChipClick}
            onFill={onChipClick}
            onRemove={onRemoveSlot}
            channel={channel}
            onEdge={onSetTransition}
          />
          {hint && (
            <div className="text-caption" style={{ color: 'var(--on-surface-subtle)', fontSize: 'var(--type-caption)' }}>
              {hint}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
