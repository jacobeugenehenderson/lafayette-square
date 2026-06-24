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
 *                transitionIn?: minutes, transitionOut?: minutes }
 *
 * Single-channel callers pretend they're single-field groups (e.g. one
 * field with key 'value'). Same code path, no special case.
 *
 * Editability gating:
 *   - flat, not yet armed → sliders editable (tweak the flat baseline)
 *   - animation mode (armed or animated), a slot TILE selected →
 *     editable; the displayed value is the RESOLVED (tweened) value, and
 *     the first edit at an unkeyed slot mints its keyframe
 *   - animation mode, no tile selected → read-only (select a tile to key)
 *
 * Keyframes are born from EDITS, never navigation: clicking a slot tile only
 * moves the playhead (and selects it as the edit target). An edit records a
 * keyframe ONLY when a slot tile is selected — editing with no tile selected
 * does nothing and never moves the timeline.
 *
 * Animate toggle:
 *   - dashed empty "animate" → call to action (off)
 *   - filled gold "↓"        → armed, awaiting first keyframe (no slot is
 *     auto-filled — scrub + edit to seed one)
 *   - filled gold "animated" → committed (data state animated=true)
 *   Toggling off while animated calls onUnanimate (collapse to flat AND
 *   hide the row).
 *
 * Clear (was "revert"):
 *   - parked on a keyframe → remove just that keyframe (value falls back
 *     to the tween) via onRemoveSlot
 *   - otherwise → clear the whole channel to flat defaults via onRevert
 *
 * Chip row:
 *   - All 7 NAMED_TOD_SLOTS chips always render. Filled = attached,
 *     dashed = empty. Parked = stronger ring + bg.
 *   - Plain click (empty or filled) → scrub to that slot. No keyframe.
 *   - Right-click or ⌘/Ctrl-click on filled → onRemoveSlot.
 *
 * The component imports useTimeOfDay + scrubToTodSlot from the cartograph
 * store directly (universal across channels), and reads NAMED_TOD_SLOTS
 * from animatedParam (the canonical slot vocabulary).
 */
import { useState } from 'react'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCartographStore from './stores/useCartographStore.js'
import {
  NAMED_TOD_SLOTS, getTodSlotLabel, todSlotAtMinute,
  getTodSlotMinutes, resolveGroupAtMinute,
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

function SlotChip({ slot, attached, parked, atPlayhead, onScrub, onFill, onRemove }) {
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
    flex: '1 1 0',
    minWidth: 0,
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
    ? `${slot.label}${parked ? ' (parked)' : ''} · right-click or ⌘-click to clear this keyframe`
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

// ── Ramp input (↑ N before / N ↓ after) ────────────────────────────────────

function RampInput({ side, value, onChange }) {
  const arrow = side === 'in' ? '↑' : '↓'
  const title = side === 'in'
    ? 'Ramp in (minutes): how long the channel eases in before the first attached slot'
    : 'Ramp out (minutes): how long the channel eases out after the last attached slot'
  return (
    <label className="inline-flex items-center" style={{ gap: 2 }} title={title}>
      {side === 'in' && (
        <span style={{ color: 'var(--on-surface-subtle)', fontSize: 'var(--type-caption)', lineHeight: 1 }}>{arrow}</span>
      )}
      <input
        type="number" min={0} max={720} step={1} value={value}
        onChange={(e) => onChange(side, e.target.value)}
        className="tod-ramp-input"
        style={{
          width: 32, fontSize: 'var(--type-caption)', padding: '2px 3px',
          background: 'var(--surface-container-highest)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 4, textAlign: 'center',
          fontFamily: 'inherit',
        }}
      />
      {side === 'out' && (
        <span style={{ color: 'var(--on-surface-subtle)', fontSize: 'var(--type-caption)', lineHeight: 1 }}>{arrow}</span>
      )}
    </label>
  )
}

// ── Animation row (ramps + 7 chips) ────────────────────────────────────────

function TodAnimationRow({
  attachedIds, parkedSlotId, playheadSlotId,
  onScrub, onFill, onRemove,
  transitionIn, transitionOut, onTransitionChange,
}) {
  // Ramps are only meaningful once at least one slot is attached.
  const showRamps = attachedIds.size > 0
  return (
    <div className="flex items-center pt-1" style={{ gap: 6 }}>
      {showRamps
        ? <RampInput side="in" value={transitionIn} onChange={onTransitionChange} />
        : <span style={{ width: 50 }} />}
      <div className="flex items-center justify-center" style={{ gap: 3, flex: 1 }}>
        {NAMED_TOD_SLOTS.map(slot => (
          <SlotChip
            key={slot.id}
            slot={slot}
            attached={attachedIds.has(slot.id)}
            parked={slot.id === parkedSlotId}
            atPlayhead={slot.id === playheadSlotId}
            onScrub={onScrub}
            onFill={onFill}
            onRemove={onRemove}
          />
        ))}
      </div>
      {showRamps
        ? <RampInput side="out" value={transitionOut} onChange={onTransitionChange} />
        : <span style={{ width: 50 }} />}
    </div>
  )
}

// ── Animate toggle ─────────────────────────────────────────────────────────

function AnimateToggle({ armed, animated, onClick }) {
  const accent = 'var(--vic-gold)'
  const baseStyle = {
    height: 18,
    minWidth: 64,
    padding: '0 8px',
    borderRadius: 4,
    fontSize: 'var(--type-caption)',
    lineHeight: 1,
    fontFamily: 'var(--carto-font)',
    cursor: 'pointer',
    transition: 'background 120ms, border-color 120ms, color 120ms',
    textAlign: 'center',
  }
  const armedStyle = {
    ...baseStyle,
    background: `color-mix(in srgb, ${accent} 22%, transparent)`,
    border: `1px solid ${accent}`,
    color: accent,
    fontWeight: 500,
  }
  const idleStyle = {
    ...baseStyle,
    background: 'transparent',
    border: `1px dashed color-mix(in srgb, ${accent} 45%, transparent)`,
    color: `color-mix(in srgb, ${accent} 70%, transparent)`,
    fontWeight: 400,
  }
  const style = armed ? armedStyle : idleStyle
  // ↓ during armed-but-uncommitted nudges the eye toward the chip row.
  const label = !armed ? 'animate' : animated ? 'animated' : '↓'
  const title = !armed
    ? 'Start animating across time-of-day slots'
    : animated
      ? 'Cancel animation (collapse to flat)'
      : 'Click a slot to seed the first keyframe, or click here to cancel'
  return (
    <button onClick={onClick} style={style} title={title}>
      {label}
    </button>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────

function ChannelSlider({ field, value, editable, onChange }) {
  const min = field.min ?? 0
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{field.label}</span>
        <span className="font-mono" style={{ color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
          {Number(value || 0).toFixed(2)}
        </span>
      </div>
      <input type="range" min={min} max={field.max} step={field.step}
        value={Number(value) || 0}
        disabled={!editable}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--vic-gold)', opacity: editable ? 1 : 0.4 }}
        title={editable ? '' : 'Park on a slot to edit'} />
    </div>
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
 *   onUnanimate   — () → void; collapse animated channel back to flat
 *   onSetTransition — (side: 'in'|'out', minutes) → void
 *   onRevert      — () → void; collapse to flat AND reset to flatDefaults.
 *                   Backs the "Clear" button's clear-all path (when not
 *                   parked on a keyframe). One button at the channel level
 *                   (feedback_per_item_revert), never per-slider.
 */
export default function TodChannel({
  label, fields, channel, flatDefaults,
  onSetValue, onFillSlot, onRemoveSlot, onUnanimate, onSetTransition, onRevert,
}) {
  const scrubToTodSlot = useCartographStore(s => s.scrubToTodSlot)
  const currentTime    = useTimeOfDay(s => s.currentTime)

  const animated = !!channel?.animated
  const [intendAnimate, setIntendAnimate] = useState(false)
  const showRow = animated || intendAnimate

  const fieldKeys = fields.map(f => f.key)
  const attachedIds = new Set(
    animated ? Object.keys(channel.values || {}) : []
  )

  // The chip the operator last clicked = the deterministic EDIT TARGET. It
  // sticks regardless of where the playhead/clock drifts, so the controls
  // stay live on the slot you picked (the old playhead-tolerance gate went
  // dead the moment the clock advanced off the slot). Cleared when the row
  // closes / channel unanimate.
  const [selectedSlot, setSelectedSlot] = useState(null)
  const minute = currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60
  const playheadSlotId = todSlotAtMinute(minute, currentTime)
  // Edit target: the EXPLICITLY selected chip — NO playhead fallback. The
  // animator records a keyframe ONLY when a slot tile is selected, so editing
  // a value never jogs the timeline; the playhead moves on tile-click alone.
  // (The old `?? playheadSlotId` fallback silently targeted whatever slot the
  // live clock had drifted onto, minting a keyframe + scrubbing there on any
  // edit — the "changing a value moves the timeline" bug.) Null when no tile
  // is selected → sliders read-only until you pick one.
  const editTarget = showRow ? selectedSlot : null

  // Display values + editability gate.
  //   - flat & not arming → edit the flat baseline directly.
  //   - animation mode → show the value at the EDIT TARGET (its keyframe if
  //     attached, else the resolved tween at its minute), and make the
  //     controls live whenever a target exists. Clearing a keyframe drops
  //     the shown value back to the tween.
  const slotMinutes = showRow ? getTodSlotMinutes(currentTime) : null
  let displayValues, editable
  if (!showRow) {
    displayValues = channel?.values || flatDefaults || {}
    editable = true
  } else {
    const tMin = editTarget ? (slotMinutes[editTarget] ?? minute) : minute
    displayValues = resolveGroupAtMinute(channel, tMin, slotMinutes, fieldKeys, flatDefaults)
    editable = !!editTarget
  }

  // Chip click: select it as the edit target AND scrub the scene there so
  // you see the moment you're editing. Never mints a keyframe by itself.
  const onChipClick = (slotId) => { setSelectedSlot(slotId); scrubToTodSlot(slotId) }

  // Edit routing: park the playhead on the target (so the store writes to
  // THIS slot), mint its keyframe on the first edit (animate if the channel
  // was flat, else add the slot), then write the field.
  const onFieldChange = (key, value) => {
    if (!showRow) { onSetValue(key, value); return }
    const sid = editTarget
    if (!sid) return
    scrubToTodSlot(sid)
    if (!attachedIds.has(sid)) onFillSlot(sid, !animated)
    onSetValue(key, value)
  }

  const onToggleAnimate = () => {
    if (showRow) {
      if (animated) onUnanimate()
      setIntendAnimate(false)
      setSelectedSlot(null)
    } else {
      // Arm only — reveal the chip row. No auto-keyframe; the operator
      // clicks a slot and edits to seed the first one.
      setIntendAnimate(true)
    }
  }

  // Clear: target carries a keyframe → remove just that keyframe (value
  // falls back to the tween between neighbours). Otherwise → clear the
  // whole channel back to flat defaults. (Renamed from "revert".)
  const onClear = () => {
    if (animated && editTarget && attachedIds.has(editTarget)) onRemoveSlot(editTarget)
    else { onRevert(); setSelectedSlot(null) }
  }

  const hint = !showRow
    ? null
    : !editTarget
      ? 'Click a slot, then edit a value to drop a keyframe.'
      : attachedIds.has(editTarget)
        ? `Editing ${getTodSlotLabel(editTarget)} keyframe — Clear removes it.`
        : `${getTodSlotLabel(editTarget)} selected — edit a value to drop a keyframe.`

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

  // Twirl-collapsible: collapsed row is just `▸ Label  animated`.
  // Open drawer reveals sliders + animate toggle + revert + chips.
  // Default closed; component-local state (no cross-session persistence).
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderTop: '1px solid var(--outline-variant)' }}>
      {/* Collapsed-row header: chevron + label + animated badge.
          Click anywhere on the row toggles. No buttons here — revert
          and animate live inside the drawer to prevent accidents. */}
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
        {animated && (
          <span style={{
            fontSize: 10, lineHeight: 1, padding: '2px 5px',
            borderRadius: 3, marginLeft: 4,
            background: 'color-mix(in srgb, var(--vic-gold) 18%, transparent)',
            color: 'var(--vic-gold)',
            fontFamily: 'var(--carto-font)',
          }}>animated</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-2 py-2" style={{
          background: 'var(--surface-container-low, rgba(0,0,0,0.25))',
          borderRadius: 4,
          marginBottom: 4,
        }}>
          <div className="flex items-center justify-end" style={{ gap: 6 }}>
            {showClear && (() => {
              const targetIsKeyframe = animated && editTarget && attachedIds.has(editTarget)
              return (
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
              )
            })()}
            <AnimateToggle armed={showRow} animated={animated} onClick={onToggleAnimate} />
          </div>

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

          {showRow && (
            <>
              <TodAnimationRow
                attachedIds={attachedIds}
                parkedSlotId={editTarget}
                playheadSlotId={playheadSlotId}
                onScrub={onChipClick}
                onFill={onChipClick}
                onRemove={onRemoveSlot}
                transitionIn={channel?.transitionIn ?? 30}
                transitionOut={channel?.transitionOut ?? 30}
                onTransitionChange={onSetTransition}
              />
              {hint && (
                <div className="text-caption" style={{ color: 'var(--on-surface-subtle)', fontSize: 'var(--type-caption)' }}>
                  {hint}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
