/**
 * Stage — shared utility module for cartograph-hosted Stage.
 *
 * Exports arch defaults, Hero preview helpers, and the
 * StagePanel UI. Consumed by CartographApp.jsx (the real Stage host)
 * and PreviewApp.jsx. Post-FX (FilmGrade / FilmGrain / AerialPerspective
 * / PostProcessing / StageFog / StageShadows) live in
 * src/components/PostProcessing.jsx (SC.2 + SC.3, 2026-05-13). The
 * legacy envState DOM↔R3F bridge is retired — grade / grain / shadow
 * are now full TOD channels mounted in CartographPost.
 *
 * The standalone /stage route was retired 2026-05-02 — this file
 * has no default export. See feedback_stage_standalone_should_die.md.
 */

import { WindSwitch } from '../components/WindSheetCard.jsx'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useThree } from '@react-three/fiber'
import { useTownFrame } from '../lib/useTownFrame.js'
import * as THREE from 'three'

import GatewayArch from '../components/GatewayArch'
import { archSite, HALF_SPAN as ARCH_HALF_SPAN } from '../setpieces/gatewayArch.js'
import useTownPlace from '../hooks/useTownPlace.js'
import { useLandscapeManifest } from '../components/MountainBackdrop.jsx'

import { heroPoseAtTime } from '../preview/heroAnim'
import { browseUpFromHeading } from '../lib/browseHeading.js'
import {
  cameraState, cameraPush, subscribeCameraState, pushCamera, publishCameraState,
} from './cameraBridge.js'
import { streetEyeY } from '../utils/elevation'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useCartographStore, { activeChannel } from '../cartograph/stores/useCartographStore.js'
import TodChannel, { SlotChip } from '../cartograph/TodChannel.jsx'
import { LampGlowEditor } from '../cartograph/CartographSurfaces.jsx'
import { StoreChannel } from '../cartograph/CartographSkyLight.jsx'
import { setPieceOf, townForLook } from '../instance.js'
import useDisplayPreview from '../displays/preview.js'
import useFailures, { failuresFor } from '../lib/failures.js'
import { runSeconds } from '../displays/lightShow/engine.js'
import { defaultDisplayChannel, DISPLAY_FIELDS, validateDisplayChannel } from '../displays/showChannel.js'
import { nextDate, refuseShortCadence } from '../displays/showSchedule.js'
import { setAmbient, setShows, addAmbient, addShows, removeAmbient, removeShows, setDays, addEvent, removeEntry, clockTyped, clockWords, ambientSpanWords, tonightOf, yearRefusal, keyedSlots, unkeyedSlots } from './scheduleCard.js'
import { townClockOf, townDateAt, townClockChange } from '../lib/townClock.js'
import { getTodSlotRow, getTodSlotMinutes, getTodSlotLabel, getTodSlotDaysAhead, NAMED_TOD_SLOTS } from '../cartograph/animatedParam.js'
import { PLUGINS as DISPLAY_PLUGINS } from '../displays/Displays.jsx'
import { keyframeFocusIds } from '../lib/focusObject.js'
import useListings from '../hooks/useListings'
import { ARCHLIGHT_FIELDS, ARCHLIGHT_FLAT_DEFAULTS, LANTERN_FIELDS, LANTERN_FLAT_DEFAULTS, MIST_FIELDS, MIST_FLAT_DEFAULTS, HALO_FIELDS, HALO_FLAT_DEFAULTS, EDGE_RUFFLE_FIELDS, EDGE_RUFFLE_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { EDGE_DEFAULT_BAND_FRACTION } from '../../cartograph/boundaryRecords.mjs'
import DawnTimeline from '../components/DawnTimeline'
import { townRanges } from '../lib/townRange.js'
import SliderRow from '../cartograph/SliderRow.jsx'


// ── Tickers ─────────────────────────────────────────────────────────────────

function TimeTicker() {
  const tick = useTimeOfDay((s) => s.tick)
  const last = useRef(Date.now())
  useTownFrame(() => { const n = Date.now(); tick(n - last.current); last.current = n })
  return null
}
function SkyStateTicker() {
  useTownFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))
  return null
}
function FrameLimiter() {
  const inv = useThree((s) => s.invalidate)
  useEffect(() => { let id; const l = () => { inv(); id = requestAnimationFrame(l) }; id = requestAnimationFrame(l); return () => cancelAnimationFrame(id) }, [inv])
  return null
}

// ── Environment state retired ──────────────────────────────────────────────
// The grade/grain/shadow envState sliders were promoted to TOD channels
// 2026-05-13 (SC.2 follow-up). All Stage authoring now flows through the
// cartograph store + scene.json bake pipeline. `envState.js` deleted.

// ── Arch & Horizon authoring state retired ─────────────────────────────────
// archState / setArch / useArchState / subscribeArch / ARCH_DEFAULTS all
// retired 2026-05-13 (SC.7). The Gateway Arch landmark's placement +
// transform + uplights ride the cartograph store as the `arch` channel
// (GatewayArch.jsx). HorizonControls below reads the store directly via setArch /
// setLandscape; module-scope state is gone per doctrine
// project_authoring_is_live_production_is_static.

// ── Scene diagnostic (temporary) ────────────────────────────────────────────

function SceneDiag() {
  const { scene } = useThree()
  const count = useRef(0)
  useTownFrame(() => {
    if (++count.current % 300 !== 0) return  // every 5 sec at 60fps
    scene.traverse(o => {
      if (o.isLight && o.isDirectionalLight && o.castShadow) {
        console.log('[sun]', 'int:', o.intensity?.toFixed(2), 'pos:', o.position?.toArray().map(v => Math.round(v)))
      }
    })
  })
  return null
}

// ── StageShadows + EnvironmentControls retired ──────────────────────────────
// StageShadows moved to src/components/PostProcessing.jsx (shadow channel,
// SC.2 follow-up 2026-05-13). EnvironmentControls's grade/grain/shadow
// sliders are now standard TodChannels mounted by CartographPost; the
// arch + horizon authoring surface promoted to its own top-level
// "Horizon" card (no Environment wrapper). Kit-generic phrasing —
// "Hero" is the shot subject role; "Arch" is reserved for SC.7's
// LS-specific consolidation inside this card.

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="w-8 h-4 rounded-full cursor-pointer transition-colors relative"
        style={{ background: value ? 'var(--success)' : 'var(--surface-container-high)' }}
      >
        <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
          style={{ left: value ? 16 : 2 }} />
      </button>
    </div>
  )
}

// Uplights — the Arch's where the Look carries an Arch (LS), the set-piece's where the town declares one
// (SetPieceUplights.jsx), neither elsewhere. Same fields; store-bound through the generic StoreChannel.
function Uplights() {
  const hasArch = useCartographStore(s => !!s.arch)
  const lookId  = useCartographStore(s => s.activeLookId)
  const sp = setPieceOf(lookId)
  if (!hasArch && !sp) return null
  return (<>
    <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
    {hasArch && <StoreChannel name="archLight" label="Arch uplights" fields={ARCHLIGHT_FIELDS} flatDefaults={ARCHLIGHT_FLAT_DEFAULTS} />}
    {sp && <StoreChannel name="setPieceLight" label={`${sp.name || 'Set-piece'} uplights`} fields={ARCHLIGHT_FIELDS} flatDefaults={ARCHLIGHT_FLAT_DEFAULTS} />}
  </>)
}

const ALERT_STYLE = { background: 'var(--error-container, #5c1a1a)', color: 'var(--on-error-container, #ffdad6)' }

// What the kit took out of this town, and why (src/lib/failures.js, the one sink): a layer's refusal, a layer a
// boundary gave up retrying, a display that failed. Renders nothing when nothing failed; an entry goes when its layer
// draws again, or on reload.
// ⭐ ABOVE THE SPLASH: a refused layer the reveal waits on holds the town on its emblem (Town.jsx#RevealGate), and the
// splash (Town.jsx#CanvasOverlay, zIndex 300) covers the canvas's host and Stage's panel with it. So the banner is
// portalled to the page, fixed under the toolbar, over the overlay: the operator reads why the town is held. Stage's
// alone: the public player's splash is the Ward's to style (it reads the sink through Town.jsx's useFailures).
const FAILURES_Z = 400
function FailuresBanner() {
  const lookId = useCartographStore(s => s.activeLookId)
  const list = failuresFor(useFailures(s => s.failed), lookId)
  if (!list.length) return null
  return createPortal(
    <div className="glass-panel rounded-xl p-3 pointer-events-auto"
      style={{ position: 'fixed', top: 72, left: 16, maxWidth: 560, zIndex: FAILURES_Z }}>
      {list.map(f => (
        <div key={`${f.lookId}/${f.layer}`} role="alert" className="text-caption rounded px-2 py-1 my-1" style={ALERT_STYLE}>
          {f.layer} {f.kind === 'refusal' ? 'refused' : 'failed'}: {f.reason}
        </div>
      ))}
    </div>,
    document.body,
  )
}

// Displays — every town has the section; its contents are the town's displays (Jacob, 2026-10-30: "Displays", no
// extra text). Each plays LIVE (its season and schedule, on the town's clock) unless previewed here: Off (hung, unlit),
// Glow or Show, from the moment pressed. The preview is Stage's alone (src/displays/preview.js).
function DisplaysSection() {
  const lookId = useCartographStore(s => s.activeLookId)
  const list = (lookId && townForLook(lookId)?.displays) || []
  const modes = useDisplayPreview(s => s.modes), setMode = useDisplayPreview(s => s.setMode), failed = useFailures(s => s.failed)
  return (
    <Collapsible label="Displays">
      {list.map(d => {
        const cur = modes[d.id]?.mode || 'live'
        return (<div key={d.id}>
          {failed[`${lookId}/display:${d.id}`] && (
            <div role="alert" className="text-caption rounded px-2 py-1 my-1" style={ALERT_STYLE}>
              Display {d.id} failed: {failed[`${lookId}/display:${d.id}`].reason}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{d.name || DISPLAY_PLUGINS[d.kind]?.label || d.kind}</span>
            <div className="flex gap-1">
              {['live', 'off', 'glow', 'show'].map(m => (
                <button key={m} onClick={() => setMode(d.id, m)}
                  className="px-2 py-0.5 rounded text-caption cursor-pointer capitalize"
                  style={{ background: cur === m ? 'var(--surface-container-high)' : 'transparent', color: cur === m ? 'var(--on-surface)' : 'var(--on-surface-variant)', border: '1px solid var(--outline-variant)' }}>{m}</button>
              ))}
            </div>
          </div>
          {d.kind === 'light-show' && <DisplayChannel display={d} />}
        </div>)
      })}
    </Collapsible>
  )
}

/**
 * TONIGHT, inside the Lit card (Jacob, 2026-11-02: one picture of the night, the keys and the Schedule together): noon to
 * noon, Ambient's LEVEL as the keys and the Schedule make it (scheduleCard.js#tonightOf, the engine's own functions, so the
 * picture and the show agree), a tick at each showtime, the clock's change if tonight has one, and the year's refusal if the
 * schedule has one (scheduleCard.js#yearRefusal: what Publish and the player refuse, said here first). Read-only.
 */
function Tonight({ display, channel, keys = [], selected, onSelect }) {
  const now = useTimeOfDay(s => s.currentTime)
  const D = townClockOf(now).date, secs = runSeconds(display.run)
  const t = useMemo(() => tonightOf(channel, D, secs, getTodSlotRow), [channel, D, secs])
  const refused = useMemo(() => yearRefusal(channel, getTodSlotDaysAhead(now, 366), secs), [channel, D, secs])   // eslint-disable-line react-hooks/exhaustive-deps
  const change = useMemo(() => {                                     // the town's clock between tonight's noon and tomorrow's
    const noon = (d) => townDateAt({ year: +d.slice(0, 4), month: +d.slice(5, 7), day: +d.slice(8, 10), minute: 720 })
    return townClockChange(noon(D), noon(nextDate(D)))
  }, [D])
  const clock = change && (change.kind === 'skip' ? `The clock skips ${change.from}–${change.to} tonight: a show there does not play.` : `The clock runs ${change.from}–${change.to} twice tonight: a show there plays twice.`)
  const peak = Math.max(1e-6, ...t.level.map(([, v]) => v))
  const pts = t.level.map(([m, v]) => `${(m / 1440 * 100).toFixed(2)},${(100 - v / peak * 92).toFixed(1)}`).join(' ')
  return (
    <div className="py-1" aria-label="Tonight's schedule">
      <div className="text-caption" style={CAPTION}>{t.line}</div>
      {refused && <div role="alert" className="text-caption" style={{ ...CAPTION, color: 'var(--error)' }}>Refused, and Publish refuses it too: {plainReason({ message: refused })}</div>}
      {clock && <div className="text-caption" style={CAPTION}>{clock}</div>}
      <div className="relative rounded my-1" style={{ height: 28, background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', overflow: 'hidden' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <polygon points={`0,100 ${pts} 100,100`} fill="var(--tod-dusk)" fillOpacity={0.55} />
        </svg>
        {t.times.map(x => <div key={x} title={`A show at ${clockWords(x)}`} className="absolute" style={{ left: `${((x - 720) / 1440) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--on-surface)' }} />)}
      </div>
      <div className="relative" style={{ height: 12 }} aria-label="The keys, tonight">
        {keys.map(s => {
          const m = getTodSlotRow(D)[s], on = s === selected
          return <button key={s} title={`The key at ${getTodSlotLabel(s)} (${clockWords(m)})`} onClick={() => onSelect?.(s)} className="absolute cursor-pointer"
            style={{ left: `calc(${(((m - 720) % 1440 + 1440) % 1440) / 1440 * 100}% - 5px)`, top: 0, width: 10, height: 10, transform: 'rotate(45deg)', padding: 0,
              background: on ? 'var(--vic-gold)' : 'transparent', border: `1px solid ${on ? 'var(--vic-gold)' : 'var(--on-surface-variant)'}` }} />
        })}
      </div>
      <div className="flex justify-between text-caption" style={CAPTION}><span>noon</span><span>6 pm</span><span>midnight</span><span>6 am</span><span>noon</span></div>
    </div>
  )
}

/** The display's channel as Stage holds it, read as the player reads it (an old Look through its one reader), or the
 *  refusal by name: never a guess. */
function readChannel(authored, id) {
  try { return { channel: authored ? validateDisplayChannel(authored, `Stage › Displays › ${id}`) : defaultDisplayChannel() } }
  catch (e) { return { refused: String(e?.message || e).replace(/^\[[^\]]*\] ⛔ /, '') } }
}

/**
 * A display's LIT card (Jacob, 2026-11-02: one home per fact, one picture of the night): Tonight (Ambient's level as the keys
 * and the Schedule make it, the showtimes, a marker at each key), the KEYS the operator made (picked by marker or name,
 * never by scrubbing the clock; "+ key at" the slots not keyed), the three levels of the selected key only, and the
 * Schedule (the WHEN). The lamps keep TodChannel; a display does not. The first edit gives this Look its own copy of the
 * default; "Back to the default" drops it. Lights the display live (<Town overrides.displays>); the bake carries it.
 */
function DisplayChannel({ display }) {
  const id = display.id
  const authored = useCartographStore(s => s.displays?.[id])
  const read = useMemo(() => readChannel(authored, id), [authored, id])
  const setValue = useCartographStore(s => s.setDisplayValue), addSlot = useCartographStore(s => s.addDisplaySlot)
  const removeSlot = useCartographStore(s => s.removeDisplaySlot)
  const revert = useCartographStore(s => s.revertDisplay)
  const [picked, setPicked] = useState(null), [refused, setRefused] = useState(null)
  if (read.refused) return <div role="alert" className="text-caption" style={{ color: 'var(--error)' }}>{read.refused}</div>
  const values = read.channel.values, keys = keyedSlots(values), selected = keys.includes(picked) ? picked : keys[0]
  const put = (gesture) => { try { gesture(); setRefused(null) } catch (e) { setRefused(plainReason(e)) } }
  const published = authored && authored !== read.channel   // a Look from before the schedule, shown as read, saved new on the next edit
  return (
    <div className="py-1 space-y-2" aria-label="Lit">
      <div className="flex items-center justify-between">
        <span style={SUBHEAD}>Lit</span>
        {authored && <Action title="Drop this Look's own channel: the display is lit by the default again" onClick={() => revert(id)}>Back to the default</Action>}
      </div>
      {published && <div className="text-caption" style={CAPTION}>This Look keeps its schedule in the form from before the Schedule block; it is shown as read, and saved in the new form on your next edit.</div>}
      <Tonight display={display} channel={read.channel} keys={keys} selected={selected} onSelect={setPicked} />
      <div className="space-y-1.5" aria-label="The display's levels">
        <div className="flex items-center flex-wrap" style={{ gap: 3 }}>
          <span style={{ ...CAPTION, marginRight: 4 }}>Keys</span>
          {keys.map(s => <Pill key={s} on={s === selected} title={`Edit the levels at ${getTodSlotLabel(s)}`} onClick={() => setPicked(s)}>{getTodSlotLabel(s)}</Pill>)}
        </div>
        {unkeyedSlots(values).length > 0 && (
          <div className="flex items-center flex-wrap" style={{ gap: 3 }}>
            <span style={{ ...CAPTION, marginRight: 4 }}>+ key at</span>
            {unkeyedSlots(values).map(s => <Action key={s} title={`A key at ${getTodSlotLabel(s)}, starting from the levels there now`} onClick={() => put(() => { addSlot(id, s); setPicked(s) })}>{getTodSlotLabel(s)}</Action>)}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span style={SUBHEAD}>At {getTodSlotLabel(selected)}</span>
          {keys.length > 1 && <Action danger title={`Remove the key at ${getTodSlotLabel(selected)}: the levels ease between the keys left`} onClick={() => put(() => removeSlot(id, selected))}>Remove key</Action>}
        </div>
        {DISPLAY_FIELDS.map(f => (
          <SliderRow key={f.key} label={f.label} value={values[selected][f.key]} min={f.min ?? 0} max={f.max} step={f.step} suffix={f.unit ?? ''} title={f.title}
            onChange={(v) => put(() => setValue(id, f.key, v, selected))} />
        ))}
        {refused && <div role="alert" style={{ ...CAPTION, color: 'var(--error)' }}>Not saved: {refused}</div>}
      </div>
      <ScheduleBlock display={display} channel={read.channel} />
    </div>
  )
}

const CAPTION = { color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }
const VALUE = { color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }
const SUBHEAD = { color: 'var(--on-surface)', fontSize: 'var(--type-caption)', fontWeight: 500 }
const plainReason = (e) => String(e?.message || e).replace(/^\[[^\]]*\] ⛔ [^:]*: /, '')
const HHMM_RE = /^\d\d:\d\d$/
const endLabel = (v) => v === 'after-last-show' ? 'after the last show' : HHMM_RE.test(v) ? clockWords(v) : (NAMED_TOD_SLOTS.find(s => s.id === v)?.label ?? v)
/** A choice in the panel's toggle style (TodChannel#ChannelToggle): gold when chosen, dashed when not. */
function Pill({ on, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      height: 18, padding: '0 8px', borderRadius: 4, fontSize: 'var(--type-caption)', lineHeight: 1, fontFamily: 'var(--carto-font)',
      cursor: 'pointer', whiteSpace: 'nowrap',
      background: on ? 'color-mix(in srgb, var(--vic-gold) 22%, transparent)' : 'transparent',
      border: on ? '1px solid var(--vic-gold)' : '1px dashed var(--outline-variant)',
      color: on ? 'var(--vic-gold)' : 'var(--on-surface-subtle)', fontWeight: on ? 500 : 400,
    }}>{children}</button>
  )
}
/** An ACTION, worded as a verb ("Remove shows", "+ Add Ambient"): never a value, so it cannot be read as one. */
function Action({ onClick, title, children, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      height: 18, padding: '0 8px', borderRadius: 4, fontSize: 'var(--type-caption)', lineHeight: 1, fontFamily: 'var(--carto-font)',
      cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent',
      border: `1px solid ${danger ? 'color-mix(in srgb, var(--error) 55%, transparent)' : 'var(--outline-variant)'}`,
      color: danger ? 'var(--error)' : 'var(--on-surface-variant)',
    }}>{children}</button>
  )
}
/**
 * One END: the eight slot chips (the Lit card's own), a clock time, and any extra choice (Ambient's "after the last show").
 * Choosing "clock" WRITES NOTHING: it opens the time, seeded with the chosen slot's time today, and a time typed (Enter, or
 * leaving the field after typing) is the write. Times are typed as people type them and shown as the panel shows them
 * (scheduleCard.js#clockTyped, #clockWords: "midnight", "noon", "9:30pm"). `say(v)` → a sentence to state BEFORE saving v
 * (Ambient glowing until after noon tomorrow), and under the row after: stated, never refused.
 */
function EndRow({ label, value, onChange, extra = [], title, say }) {
  const [clockOpen, setClockOpen] = useState(false), [draft, setDraft] = useState(null), [bad, setBad] = useState(null), [pending, setPending] = useState(null)
  useEffect(() => { setClockOpen(false); setDraft(null); setBad(null); setPending(null) }, [value])
  const isClock = HHMM_RE.test(value), showClock = isClock || clockOpen
  const seeded = () => { const m = getTodSlotMinutes(useTimeOfDay.getState().currentTime)[value]; return Number.isFinite(m) ? clockWords(m) : '' }
  const text = draft ?? (isClock ? clockWords(value) : seeded())
  const choose = (v) => { if (v === value) return; const st = say?.(v); if (st) setPending({ v, st }); else onChange(v) }
  const commit = (typed) => {
    const c = clockTyped(typed)
    if (!c) { setBad(`Type ${label.toLowerCase()} as a time: 9pm, 21:30, midnight or noon`); return }
    setBad(null); setDraft(null); choose(c)
  }
  const standing = !pending && say ? say(value) : null
  return (
    <div className="space-y-0.5" title={title}>
      <div className="flex items-center justify-between"><span style={CAPTION}>{label}</span><span className="font-mono" style={VALUE}>{clockOpen && !isClock ? 'a clock time' : endLabel(value)}</span></div>
      <div className="flex items-center" style={{ gap: 3 }}>
        {NAMED_TOD_SLOTS.map(slot => (
          <div key={slot.id} style={{ flex: '1 1 0', minWidth: 0 }}>
            <SlotChip slot={slot} attached={value === slot.id} parked={value === slot.id && !clockOpen} fade={null}
              onScrub={() => choose(slot.id)} onFill={() => choose(slot.id)} onRemove={() => {}} title={`${label}: ${slot.label}`} />
          </div>
        ))}
        <Pill on={showClock} title={`${label}: a time on the town's clock`} onClick={() => setClockOpen(true)}>clock</Pill>
        {extra.map(([v, l]) => <Pill key={v} on={value === v} title={`${label}: ${l}`} onClick={() => choose(v)}>{l}</Pill>)}
      </div>
      {showClock && (
        <div className="flex items-center justify-end" style={{ gap: 4 }}>
          <span style={CAPTION}>at</span>
          <input type="text" aria-label={`${label}, a clock time`} value={text} placeholder="9:30pm" autoFocus={clockOpen && !isClock}
            onChange={(e) => setDraft(e.target.value)} onBlur={(e) => { if (draft != null) commit(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); if (e.key === 'Escape') { setDraft(null); setClockOpen(false) } }}
            className="font-mono" style={{ width: '9ch', textAlign: 'right', padding: '0 3px', ...VALUE, background: 'transparent', border: '1px solid var(--outline-variant)', borderRadius: 3 }} />
        </div>
      )}
      {bad && <div role="alert" style={{ ...CAPTION, color: 'var(--error)' }}>{bad}</div>}
      {pending && (
        <div role="status" className="flex items-center flex-wrap" style={{ ...CAPTION, gap: 4, color: 'var(--on-surface)' }}>
          <span>{pending.st}</span>
          <Action title="Save it as it is" onClick={() => { const v = pending.v; setPending(null); onChange(v) }}>Save it</Action>
          <Action title="Leave it as it was" onClick={() => setPending(null)}>Change it</Action>
        </div>
      )}
      {standing && <div style={CAPTION}>{standing}</div>}
    </div>
  )
}
/** A dated entry's dates, YYYY-MM-DD, comma-separated; written on Enter or on leaving the field after typing. */
function DatesField({ dates, onCommit }) {
  const [draft, setDraft] = useState(null)
  useEffect(() => { setDraft(null) }, [dates.join(',')])   // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (text) => { setDraft(null); onCommit(text.split(',').map(x => x.trim()).filter(Boolean)) }
  return (
    <div className="flex items-center justify-between" style={{ gap: 6 }}>
      <span style={CAPTION}>Dates</span>
      <input type="text" aria-label="Dates, YYYY-MM-DD, comma-separated" value={draft ?? dates.join(', ')} onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => { if (draft != null) commit(e.target.value) }} onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value) }}
        className="font-mono" style={{ flex: 1, minWidth: 0, padding: '0 4px', ...VALUE, background: 'transparent', border: '1px solid var(--outline-variant)', borderRadius: 3 }} />
    </div>
  )
}

/**
 * THE SCHEDULE, the display's WHEN (Jacob, 2026-11-01: "a very logical setup of 'start/end, recurring'"; 2026-11-02: the
 * Schedule alone says when, the keys above only how bright): entries like calendar invites (src/displays/showSchedule.js).
 * Each: its days; AMBIENT (comes on, fades in, goes off at a moment, a time, or after the last show, fades out; or removed,
 * for fireworks); the SHOWS (first show, last show starts, every N minutes; or removed). Every change is a gesture of
 * scheduleCard.js, judged by the store; a refusal is shown in the card's own words, with the attempt left on the card
 * (NOT SAVED) so the controls and the message agree, until the next change or "Back to the saved schedule".
 */
function ScheduleBlock({ display, channel }) {
  const setSchedule = useCartographStore(s => s.setDisplaySchedule)
  const secs = runSeconds(display.run)
  const [tried, setTried] = useState(null)                           // { list, reason }: a refused attempt, as attempted
  useEffect(() => { setTried(null) }, [channel])
  const list = tried?.list ?? channel.schedule
  const put = (next) => { try { setSchedule(display.id, next, secs); setTried(null) } catch (e) { setTried({ list: next, reason: plainReason(e) }) } }
  let standing = null
  try { refuseShortCadence(channel, secs, display.id) } catch (e) { standing = plainReason(e) }
  const today = townClockOf(useTimeOfDay.getState().currentTime).date, row = getTodSlotRow(today)
  return (
    <div className="pt-2 space-y-2" aria-label="The display's schedule">
      <div className="flex items-center justify-between">
        <span style={SUBHEAD}>Schedule</span>
        <Action title="A dated event: on its dates it replaces the daily schedule" onClick={() => put(addEvent(list, today))}>+ Dated event</Action>
      </div>
      {tried && (
        <div role="alert" className="space-y-1" style={{ ...CAPTION, color: 'var(--error)' }}>
          <div>Not saved: {tried.reason}</div>
          <Action title="Show the schedule as it is saved" onClick={() => setTried(null)}>Back to the saved schedule</Action>
        </div>
      )}
      {!tried && standing && <div role="alert" style={{ ...CAPTION, color: 'var(--error)' }}>{standing}</div>}
      {list.map((e, i) => {
        const daysKind = e.days === 'daily' || e.days === 'weekdays' ? e.days : 'dates'
        const a = e.ambient, sh = e.shows
        return (
          <div key={i} className="space-y-1.5 rounded p-2" style={{ border: '1px solid var(--outline-variant)' }}>
            <div className="flex items-center justify-between" style={{ gap: 4 }}>
              <div className="flex" style={{ gap: 3 }}>
                {[['daily', 'Every day'], ['weekdays', 'Weekdays'], ['dates', 'On dates']].map(([k, l]) => (
                  <Pill key={k} on={daysKind === k} title={k === 'dates' ? 'On these dates it replaces the daily schedule' : l} onClick={() => daysKind !== k && put(setDays(list, i, k, today))}>{l}</Pill>
                ))}
              </div>
              {list.length > 1 && <Action danger title="Remove this entry from the schedule" onClick={() => put(removeEntry(list, i))}>Remove entry</Action>}
            </div>
            {daysKind === 'dates' && <DatesField dates={e.days.dates} onCommit={(dates) => put(setDays(list, i, { dates }, today))} />}
            <div style={SUBHEAD}>Ambient</div>
            {a ? (<>
              <EndRow label="Comes on" value={a.on} say={(v) => ambientSpanWords({ ambient: { ...a, on: v } }, row)} onChange={(v) => put(setAmbient(list, i, 'on', v))} />
              <SliderRow label="Fades in" value={a.fadeIn} min={0} max={240} step={1} suffix=" min" title="Minutes Ambient fades in (0 is a switch)" onChange={(v) => put(setAmbient(list, i, 'fadeIn', v))} />
              <EndRow label="Goes off" value={a.off} say={(v) => ambientSpanWords({ ambient: { ...a, off: v } }, row)} extra={sh ? [['after-last-show', 'after the last show']] : []} onChange={(v) => put(setAmbient(list, i, 'off', v))} />
              {a.off !== 'after-last-show' && <SliderRow label="Fades out" value={a.fadeOut} min={0} max={240} step={1} suffix=" min" title="Minutes Ambient fades out (0 is a switch)" onChange={(v) => put(setAmbient(list, i, 'fadeOut', v))} />}
              {sh && <div className="flex justify-end"><Action danger title="No Ambient on this entry: only its shows play (fireworks)" onClick={() => put(removeAmbient(list, i))}>Remove Ambient</Action></div>}
            </>) : (
              <div className="flex items-center justify-between"><span style={CAPTION}>Only the shows play (fireworks).</span><Action title="Ambient between the shows" onClick={() => put(addAmbient(list, i))}>+ Add Ambient</Action></div>
            )}
            <div style={SUBHEAD}>Shows</div>
            {sh ? (<>
              <EndRow label="First show" value={sh.first} onChange={(v) => put(setShows(list, i, 'first', v))} />
              <EndRow label="Last show starts" title="The last show starts here, and plays whole" value={sh.last} onChange={(v) => put(setShows(list, i, 'last', v))} />
              <SliderRow label="Every" value={sh.every} min={1} max={240} step={1} suffix=" min" title="Minutes between shows" onChange={(v) => put(setShows(list, i, 'every', v))} />
              {a && a.off !== 'after-last-show' && <div className="flex justify-end"><Action danger title="No shows on this entry: Ambient only" onClick={() => put(removeShows(list, i))}>Remove shows</Action></div>}
            </>) : (
              <div className="flex items-center justify-between"><span style={CAPTION}>Ambient only.</span><Action title="Shows, every hour by default" onClick={() => put(addShows(list, i))}>+ Add shows</Action></div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Lantern — the lamp's own light source (Bulb · Glow · Glow size · Colour), TOD-animatable. Same store-bound TodChannel pattern.
function LanternChannel() {
  const channel       = useCartographStore(s => s.lantern)
  const setValue      = useCartographStore(s => s.setLantern)
  const animate       = useCartographStore(s => s.animateLantern)
  const addSlot       = useCartographStore(s => s.addLanternSlot)
  const removeSlot    = useCartographStore(s => s.removeLanternSlot)
  const setTransition = useCartographStore(s => s.setLanternTransition)
  const revert        = useCartographStore(s => s.revertLantern)
  return (
    <TodChannel
      label="Lantern"
      fields={LANTERN_FIELDS}
      flatDefaults={LANTERN_FLAT_DEFAULTS}
      channel={channel}
      onSetValue={(key, value, slotId) => setValue(key, value, slotId)}
      onFillSlot={(slotId, isFirst) => isFirst ? animate(slotId) : addSlot(slotId)}
      onRemoveSlot={removeSlot}
      onSetTransition={setTransition}
      onRevert={revert}
    />
  )
}

/** Where the Arch stands (derived, not authored) and which of the hero's keys that focus it aim off it. A key's aim is
 *  the operator's: this says so, it never moves it. "Off" = beyond the Arch's own half-width as seen from the key. */
function ArchSiteNote() {
  const place = useTownPlace()
  const a = useCartographStore(s => s.arch?.values)
  const keyframes = useCartographStore(s => s.heroKeyframes)
  if (!a) return null
  const site = archSite(place)
  const ids = keyframes?.length ? keyframeFocusIds(keyframes) : []
  const off = []
  ;(keyframes || []).forEach((k, i) => {
    if (ids[i] !== 'arch' || !k?.position || !k?.target) return
    const [px, , pz] = k.position, [tx, , tz] = k.target
    const toArch = Math.atan2(site.z - pz, site.x - px), toAim = Math.atan2(tz - pz, tx - px)
    const yaw = Math.atan2(Math.sin(toArch - toAim), Math.cos(toArch - toAim))
    const half = Math.atan2(ARCH_HALF_SPAN * a.scale, Math.hypot(site.x - px, site.z - pz))
    if (Math.abs(yaw) > half) off.push(`key ${i + 1} by ${(yaw * 180 / Math.PI).toFixed(1)}°`)
  })
  return (
    <div className="text-caption px-1" style={{ color: 'var(--on-surface-variant)' }}>
      Stands on its real feet: {(Math.hypot(site.x, site.z) / 1000).toFixed(2)} km out. Its real facing is {(((site.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toFixed(2)} rad{Number.isFinite(a.rotation) ? `; Rotation authors ${a.rotation.toFixed(2)}` : ', unauthored'}.
      {off.length > 0 && <div style={{ color: 'var(--error)' }}>The aim misses the Arch at {off.join(' · ')}: re-key to frame it.</div>}
    </div>
  )
}

function HorizonControls() {
  // Live store reads — drag a slider, retint instantly in Stage; values
  // persist to design.json via the debounced save path; reload Stage and
  // the values are still there. (SC.7 fix: previously archState was
  // module-scope and reload lost everything.)
  const archChannel      = useCartographStore(s => s.arch)
  const landscapeChannel = useCartographStore(s => s.landscape)
  const setArch       = useCartographStore(s => s.setArch)
  const setLandscape  = useCartographStore(s => s.setLandscape)
  const a = archChannel?.values || {}
  const place = useTownPlace()
  const archFacing = archChannel ? (() => { const f = archSite(place).facing; return ((f % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) })() : 0
  const ls = landscapeChannel?.values || {}
  // The Snowline's reach is the backdrop's own elevation (its manifest's `elevM`), never a fixed span (Class D).
  // ⛔ No fallback: an unknown range collapses the slider to 0 and says so (townRange.js's rule).
  const lookId = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  // The card shows the knobs of what the Look HAS: the backdrop's where the town has a baked landscape, the Arch's where
  // the Look carries an `arch` block, both where it has both. (It was the Survey hero's kind until that retired.)
  const backdrop = useLandscapeManifest(lookId, bakeLastMs)
  const isLandscape = !!backdrop
  const elev = backdrop?.elevM
  const elevKnown = Number.isFinite(elev?.min) && Number.isFinite(elev?.max) && elev.max > elev.min
  return (
    <Collapsible label="Horizon">
      <div className="space-y-1">
        {isLandscape ? (<>
          {/* Landscape backdrop — placement (geo-anchor seeded) + snowline + atmosphere */}
          <SliderRow label="Distance" value={ls.distance} min={500} max={20000} step={50}
            onChange={(v) => setLandscape('distance', v)} />
          <SliderRow label="Scale" value={ls.scale} min={0.2} max={4.0} step={0.05}
            onChange={(v) => setLandscape('scale', v)} />
          <SliderRow label="Bearing X" value={ls.bearingX} min={-1} max={1} step={0.01}
            onChange={(v) => setLandscape('bearingX', v)} />
          <SliderRow label="Bearing Z (N=−)" value={ls.bearingZ} min={-1} max={1} step={0.01}
            onChange={(v) => setLandscape('bearingZ', v)} />
          <SliderRow label="Rotation" value={ls.rotation} min={0} max={Math.PI * 2} step={0.01}
            onChange={(v) => setLandscape('rotation', v)} />
          <SliderRow label="Y Offset" value={ls.yOffset} min={-500} max={500} step={5}
            onChange={(v) => setLandscape('yOffset', v)} />
          <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
          <SliderRow label="Snowline (m)" value={ls.snowline} min={elevKnown ? elev.min : 0} max={elevKnown ? elev.max : 0} step={10}
            onChange={(v) => setLandscape('snowline', v)} />
          {!elevKnown && <div className="text-caption px-1" style={{ color: 'var(--error)' }}>
            {backdrop === undefined ? 'Reading the backdrop…' : 'The backdrop carries no elevation range (elevM): Snowline is collapsed. Run the Foundry again (the landscape step).'}
          </div>}
          <SliderRow label="Snow Softness" value={ls.snowSoftness} min={0} max={800} step={10}
            onChange={(v) => setLandscape('snowSoftness', v)} />
          <ColorRow label="Snow" value={ls.snowColor} onChange={(v) => setLandscape('snowColor', v)} />
          <ColorRow label="Rock" value={ls.rockColor} onChange={(v) => setLandscape('rockColor', v)} />
          <ColorRow label="Scrub" value={ls.scrubColor} onChange={(v) => setLandscape('scrubColor', v)} />
          <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
          <SliderRow label="Backdrop Haze" value={ls.haze} min={0} max={1} step={0.01}
            onChange={(v) => setLandscape('haze', v)} />
          <ColorRow label="Haze" value={ls.hazeColor} onChange={(v) => setLandscape('hazeColor', v)} />
        </>) : null}
        {archChannel ? (<>
          <SliderRow label="Hero Scale" value={a.scale} min={0.5} max={5.0} step={0.05}
            onChange={(v) => setArch('scale', v)} />
          <SliderRow label="Hero Rotation" value={a.rotation ?? archFacing} min={0} max={Math.PI * 2} step={0.01}
            onChange={(v) => setArch('rotation', v)} />
          <SliderRow label="Hero Y Offset" value={a.yOffset} min={-200} max={200} step={1}
            onChange={(v) => setArch('yOffset', v)} />
          <SliderRow label="Foot Fade" value={a.footFade} min={0} max={120} step={1}
            onChange={(v) => setArch('footFade', v)} />
          <ArchSiteNote />
        </>) : null}
        {/* The distance: the Arch or the backdrop above (only where the town has one), then the air between, then
            the town's own edge. */}
        {(isLandscape || archChannel) && <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />}
        <StoreChannel name="mist" label="Mist" fields={MIST_FIELDS} flatDefaults={MIST_FLAT_DEFAULTS} />
        <StoreChannel name="halo" label="Halo" fields={HALO_FIELDS} flatDefaults={HALO_FLAT_DEFAULTS} />
        <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
        <EdgeControls />
      </div>
    </Collapsible>
  )
}

// The town's faded edge (moved here from Extent, 2026-10-06): the Fade band in metres and the Ruffle, a TOD channel.
// The band shows at the next Bake (the ground fades on the baked band); the ruffle is live. Extent keeps the radius,
// which cuts the geometry, and shows this band as a read-only ring. Unauthored, the band is 5% of the radius — the
// row says so rather than showing a number that looks chosen.
function EdgeControls() {
  const band = useCartographStore(s => s.edgeFadeBand)
  const setBand = useCartographStore(s => s.setEdgeFadeBand)
  const radius = useCartographStore(s => s.sceneBoundary?.radius) || 0
  const shown = band ?? EDGE_DEFAULT_BAND_FRACTION * radius
  return (
    <div className="space-y-1">
      <SliderRow label="Fade band" value={shown} min={0} max={Math.max(1, Math.round(radius))} step={1} suffix=" m"
        disabled={!(radius > 0)} title={radius > 0 ? 'Width of the fade at the town\'s edge, inward from the radius — shows at the next Foundry run' : 'No disc yet — author the radius in Extent'}
        onChange={(v) => setBand(v)} />
      {band == null && radius > 0 && (
        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', paddingLeft: 8 }}>
          default — {Math.round(EDGE_DEFAULT_BAND_FRACTION * 100)}% of the radius; drag to set this town's own
        </div>
      )}
      <StoreChannel name="edgeRuffle" label="Ruffle" fields={EDGE_RUFFLE_FIELDS} flatDefaults={EDGE_RUFFLE_FLAT_DEFAULTS} />
    </div>
  )
}

// ── Camera ──────────────────────────────────────────────────────────────────


// Live camera state bridge (R3F ↔ React DOM) — lives in ./cameraBridge.js so
// the Cartograph app's own CameraRig fills the SAME record this panel reads.
// It was module-private here, which is exactly why the CAMERA card was inert
// in Cartograph (the header on cameraBridge.js has the full account).

// Browse heading: site-wide cosmetic screen-orientation, persisted into
// the slab via the cartograph store + design.json (SC.5, 2026-05-13;
// previously localStorage-only). 0° = compass-N up. Positive degrees
// rotate the world CCW underneath the camera (= screen-up sweeps east).
// All spatial data is in compass frame; this is purely a viewing
// preference, but a per-instance one — it transmits through the slab.
export function getBrowseHeading() {
  const v = useCartographStore.getState().browseHeading?.values?.value
  return Number.isFinite(v) ? v : 0
}
export function setBrowseHeading(deg) {
  useCartographStore.getState().setBrowseHeading('value', Number(deg) || 0)
}
// up vector for the overhead Browse camera given a heading in degrees.
// Camera looks down -Y; up lives in the XZ plane. heading=0 → -Z (compass-N).
// browseUpFromHeading lives in src/lib/browseHeading.js (imported at top —
// shared with Preview + production so all three consume scene.browseHeading
// identically).

// Live camera ref — populated by HeroPreview while mounted.
// Set-from-view reads this synchronously to avoid stale broadcast values.
const liveCamera = { camera: null, controls: null }
export function captureCameraSnapshot() {
  const cam = liveCamera.camera
  if (!cam) return null
  const p = cam.position
  let tx, ty, tz
  if (liveCamera.controls) {
    const t = liveCamera.controls.target
    tx = t.x; ty = t.y; tz = t.z
  } else {
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir)
    tx = p.x + dir.x * 100; ty = p.y + dir.y * 100; tz = p.z + dir.z * 100
  }
  return {
    position: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
    target: [Math.round(tx), Math.round(ty), Math.round(tz)],
    fov: Math.round(cam.fov),
    up: [cam.up.x, cam.up.y, cam.up.z],
  }
}

// ── Timeline (dawn-to-dawn with waypoint snaps + slider) ────────────────────
// Shared with Preview; see src/components/DawnTimeline.jsx.
const Timeline = DawnTimeline

// Stage-only weather switch, the Time of Day card's last row: judge a look in chosen
// weather instead of the town's live weather. Session-only, like neonForceOn: not
// saved, not baked. A mode, so a segmented pill (.mode-pill in index.css), set apart
// from the time and season chips, which are jumps.
const WEATHER_MODES = ['live', 'clear', 'overcast', 'rain', 'snow']
function WeatherSwitch() {
  const mode = useCartographStore(s => s.weatherMode)
  const set  = useCartographStore(s => s.setWeatherMode)
  return (
    <div className="mode-pill mt-3" role="group" aria-label="Weather">
      {WEATHER_MODES.map(m => (
        <button key={m} type="button" onClick={() => set(m)}
          aria-pressed={mode === m}
          title={m === 'live' ? "The town's real weather, polled" : `Stand the scene in ${m} weather (Stage only, not saved)`}
        >{m}</button>
      ))}
    </div>
  )
}

// ── Reusable input components ────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--surface-container)',
  border: '1px solid var(--outline-variant)',
  color: 'var(--on-surface)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--type-caption)',
  fontFamily: 'var(--font-mono)',
  padding: '2px 6px',
  width: '100%',
  outline: 'none',
}

function NumInput({ value, onChange, step = 1, min, max }) {
  // Hybrid: click-to-edit + horizontal drag-to-scrub.
  // Drag only activates after >3px movement, leaving clicks free to focus the input.
  const dragRef = useRef(null)
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draftStr, setDraftStr] = useState(String(value))

  const onPointerDown = (e) => {
    if (editing) return  // let the focused input own pointer events
    dragRef.current = {
      startX: e.clientX, startValue: value, moved: false, pointerId: e.pointerId,
    }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) < 3) return
    if (!d.moved) {
      d.moved = true
      e.currentTarget.setPointerCapture(d.pointerId)
    }
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
    let next = d.startValue + dx * step * mult
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(step >= 1 ? Math.round(next) : Math.round(next * 1000) / 1000)
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    if (d?.moved && e.currentTarget.hasPointerCapture(d.pointerId))
      e.currentTarget.releasePointerCapture(d.pointerId)
    dragRef.current = null
  }
  const startEdit = () => {
    setDraftStr(String(value))
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }
  const commit = () => {
    const n = parseFloat(draftStr)
    if (!Number.isNaN(n)) {
      let next = n
      if (min != null) next = Math.max(min, next)
      if (max != null) next = Math.min(max, next)
      onChange(next)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text" inputMode="numeric" autoFocus
        value={draftStr}
        style={{ ...inputStyle, width: 64, textAlign: 'center' }}
        onChange={(e) => setDraftStr(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { setEditing(false) }
        }}
      />
    )
  }
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => { if (!dragRef.current?.moved) startEdit() }}
      style={{
        ...inputStyle, width: 64, textAlign: 'center',
        cursor: 'ew-resize', touchAction: 'none', userSelect: 'none',
      }}
    >{value}</div>
  )
}

function Vec3Input({ label, value, onChange }) {
  const labels = ['X', 'Y', 'Z']
  return (
    <div className="space-y-0.5">
      <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <div className="flex gap-1">
        {value.map((v, i) => (
          <div key={i} className="flex-1 flex items-center gap-1">
            <span className="text-caption" style={{ color: 'var(--on-surface-subtle)', fontSize: 9 }}>{labels[i]}</span>
            <NumInput value={v} onChange={(n) => {
              const next = [...value]
              next[i] = n
              onChange(next)
            }} />
          </div>
        ))}
      </div>
    </div>
  )
}


function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 20, padding: 0, border: 'none', background: 'none' }} />
    </div>
  )
}

// ── Shared hero scrub position (R3F ↔ DOM) ──────────────────────────────────


const heroScrub = { t: 0 }  // the playhead, as a fraction of the shot length (preview or panel scrub)
let heroScrubListeners = new Set()
function subscribeHeroScrub(fn) { heroScrubListeners.add(fn); return () => heroScrubListeners.delete(fn) }
function notifyHeroScrub() { for (const fn of heroScrubListeners) fn() }

function useHeroScrub() {
  const [t, setT] = useState(0)
  useEffect(() => subscribeHeroScrub(() => setT(heroScrub.t)), [])
  return t
}

// ── Keyframe names ──────────────────────────────────────────────────────────

function kfName(i) { return `Key ${i + 1}` }
const fmtSec = (s) => `${Math.round(s)} s`

// ── The Hero keyframe timeline (Stage only) ─────────────────────────────────
// A timeline, like After Effects (BRIEF-keyframe-timeline, Jacob 2026-09-26).
// Keys sit at the times the operator puts them; the shot has a fixed length.
//   · The playhead goes anywhere. The camera is the operator's whenever the shot
//     is not playing (RegimeControls' orbit).
//   · KEY HERE sets a key at the playhead from the view: on a key it replaces it,
//     between keys it adds one. While playing it keys that exact moment and
//     playback carries on — pause is pause, keying is keying.
//   · Click a key marker: the playhead goes there and pauses. Drag it: retime it.
//   · DELETE removes the key under the playhead — any key but the first.
//   · One key is a static shot. With one key, Key here elsewhere adds the end key.
//   · BOUNCE: first key at 0, last key at the end; plays there and back.
//     LOOP: the camera travels on from the last key to the first, which closes
//     the loop at the end (its marker there is linked, not a key of its own).
//     Toggling redistributes the keys' times: ×(n−1)/n into a loop, and back
//     out by whatever puts the last key on the end (the exact inverse).
// ⛔ No "+ After" and no separate "Update": adding at a key's time IS updating it.
// A Camera-card button's style (Hero's Key here, Browse's Set as Browse frame).
// The panel's button colours (with .hero-btn); exported so a card passed in as a slot wears the same.
export const cardBtn = (extra = {}) => ({
  background: 'var(--surface-container-high)', color: 'var(--on-surface)',
  border: '1px solid var(--outline-variant)', ...extra,
})
const SNAP = 0.012   // fraction of the track a click snaps to a key within
const DRAG_PX = 3

// ── A key's FOCUS: an object, by identity (src/lib/focusObject.js; Jacob, 2026-10-07) ─────────────────────────
// The key's own `focus` (the Arch, or a building / set-piece by id), or none: the key takes the one before it, and a
// first key with none has no focus object (the town's blur). ⛔ Never a free point. Pick: the next building click names it
// (CartographApp#onSelectBuilding). Names are the town's own listings — the Survey's hero picker reads the same.
function useFocusName(lookId) {
  const listings = useListings((s) => s.listings)
  const sp = lookId ? setPieceOf(lookId) : null
  return useCallback((id) => {
    if (!id) return 'None — the town\'s blur'
    if (id === 'arch') return 'Gateway Arch'
    if (sp?.buildingId === id) return sp.name
    return listings.find((x) => x.building_id === id)?.name || `building ${id}`
  }, [listings, sp])
}

function FocusRow({ keyframes, onKey, setKeyframes }) {
  const lookId = useCartographStore((s) => s.activeLookId)
  const archInstalled = useCartographStore((s) => !!s.arch)
  const picking = useCartographStore((s) => s.focusPick)
  const setFocusPick = useCartographStore((s) => s.setFocusPick)
  const listings = useListings((s) => s.listings)
  const nameOf = useFocusName(lookId)
  const sp = lookId ? setPieceOf(lookId) : null
  const ids = keyframeFocusIds(keyframes)
  const own = keyframes[onKey]?.focus || ''
  const inherited = onKey === 0 ? null : ids[onKey - 1]
  // The list: inherit · the Arch (where the Look installed it) · the set-piece · the listed buildings.
  const objects = []
  if (archInstalled) objects.push(['arch', nameOf('arch')])
  if (sp?.buildingId) objects.push([sp.buildingId, sp.name])
  // One entry per BUILDING (several listings can share one: a focus is the building, never a business in it).
  const seen = new Set([sp?.buildingId])
  for (const l of [...listings].filter((l) => l?.building_id && l.name).sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(l.building_id)) continue
    seen.add(l.building_id); objects.push([l.building_id, l.name])
  }
  // A key naming something not in the list (picked from the view) still shows as itself.
  if (own && !objects.some(([v]) => v === own)) objects.unshift([own, nameOf(own)])
  const set = (v) => setKeyframes(keyframes.map((k, i) => {
    if (i !== onKey) return k
    const { focus, ...rest } = k
    return v ? { ...rest, focus: v } : rest
  }))
  const pickOn = picking === onKey
  const btn = { fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--outline-variant)', cursor: 'pointer',
    background: pickOn ? 'var(--primary)' : 'transparent', color: pickOn ? 'var(--on-primary)' : 'var(--on-surface)' }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--on-surface)' }}>
        <span style={{ color: 'var(--on-surface-subtle)', minWidth: 38 }}>Focus</span>
        <select className="carto-select" style={{ flex: 1, minWidth: 0 }} value={own} onChange={(e) => set(e.target.value)}
          title="What the depth of field holds sharp at this key — an object, never a point">
          <option value="">{onKey === 0 ? nameOf(null) : `Same as previous · ${nameOf(inherited)}`}</option>
          {objects.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="button" style={btn} onClick={() => setFocusPick(pickOn ? null : onKey)}
          title="Click a building or the set-piece in the view to focus on it">{pickOn ? 'Cancel' : 'Pick'}</button>
      </div>
      {pickOn && <div className="text-caption px-1" style={{ color: 'var(--on-surface-subtle)' }}>click a building or the set-piece in the view…</div>}
      {!own && onKey > 0 && <div className="text-caption px-1" style={{ color: 'var(--on-surface-subtle)' }}>↳ inherits {nameOf(inherited)} (from {kfName(onKey - 1)})</div>}
    </div>
  )
}

function HeroCamera({ cam, keyframes, setKeyframes, heroMotion, setHeroMotion }) {
  const f = useHeroScrub()                      // playhead, fraction of the length
  const playing = !!heroMotion.preview
  const n = keyframes.length
  const L = heroMotion.length
  const loop = heroMotion.mode === 'loop'
  const trackRef = useRef(null)
  const [scrubDragging, setScrubDragging] = useState(false)
  const drag = useRef(null)                     // { i, x0, moved }
  const gap = Math.min(0.01, 0.5 / L)           // keys stay half a second apart

  // Capture delight: a one-shot pulse on the key a capture landed on.
  const [pulse, setPulse] = useState(null)
  const pulseTimer = useRef(null)
  const triggerPulse = (index) => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current)
    setPulse(index)
    pulseTimer.current = setTimeout(() => setPulse(null), 650)
  }
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current) }, [])

  // The key under a playhead place (a loop's end is its first key, linked).
  const keyAt = useCallback((x, list = keyframes) => {
    let hit = null, best = SNAP
    list.forEach((k, i) => { const d = Math.abs(k.t - x); if (d <= best) { hit = i; best = d } })
    if (loop && list.length > 1 && 1 - x <= best) hit = 0
    return hit
  }, [keyframes, loop])
  const onKey = playing ? null : keyAt(f)
  const sel = onKey != null ? keyframes[onKey] : null

  const setPlayhead = (x) => { heroScrub.t = x; notifyHeroScrub() }
  const showAt = useCallback((x, list = keyframes, motion = heroMotion) => {
    setPlayhead(x)
    if (!list.length) return
    const p = [0, 0, 0], q = [0, 0, 0]
    const { fov } = heroPoseAtTime(list, motion, x * motion.length, p, q)
    pushCamera({ position: p.map(Math.round), target: q, fov: Math.round(fov) })
  }, [keyframes, heroMotion])
  const pause = () => { if (playing) setHeroMotion({ ...heroMotion, preview: false }) }
  const goTo = (i) => { pause(); showAt(keyframes[i].t) }

  // Opening on the first key is the Hero driver's job (HeroPreview), which is
  // mounted whether or not this card is open. Here: opening the card never
  // starts playback.
  useEffect(() => {
    setHeroMotion(m => ({ ...m, preview: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Does the view match the key under the playhead? Position + FOV within the
  // rounding the capture uses, and the LOOK DIRECTION — not the target point,
  // which the orbit re-seats on the ground under the screen centre.
  const viewMatches = (() => {
    if (!sel || !cam) return false
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    if (d(cam.position, sel.position) > 1 || Math.abs(cam.fov - sel.fov) > 1) return false
    const u = cam.target.map((v, k) => v - cam.position[k]), w = sel.target.map((v, k) => v - sel.position[k])
    const lu = Math.hypot(...u), lw = Math.hypot(...w)
    if (!lu || !lw) return false
    return (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw) > 0.9995
  })()

  const fracFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])
  // Scrub: the pose at that time; near a key, snap onto it.
  const scrubTo = (x) => {
    const hit = keyAt(x)
    showAt(hit == null ? x : (loop && hit === 0 && x > 0.5 ? 1 : keyframes[hit].t))
  }

  const play = () => setHeroMotion({ ...heroMotion, preview: true })
  // ‹ › — the previous / next key from the playhead (a loop's linked end counts).
  const marks = keyframes.map(k => k.t).concat(loop && n > 1 ? [1] : [])
  const step = (dir) => {
    if (!n) return
    pause()
    const x = dir > 0 ? marks.find(t => t > f + 1e-6) : [...marks].reverse().find(t => t < f - 1e-6)
    if (x != null) showAt(x)
  }

  const r6 = (x) => Math.round(x * 1e6) / 1e6
  const keyHere = () => {
    const snap = captureCameraSnapshot()
    if (!snap) return
    const view = { position: snap.position, target: snap.target, fov: snap.fov }
    const here = heroScrub.t
    const on = keyAt(here)
    let next, at
    if (!n) { next = [{ ...view, t: 0 }]; at = 0 }
    else if (on != null) { next = keyframes.map((k, i) => i === on ? { ...k, ...view, t: k.t } : k); at = on }   // its focus stays
    else {
      // One key: the new one is the end (bounce) or halfway round unless the
      // playhead says otherwise (loop). More: exactly where the playhead is.
      let t = here
      if (n === 1) t = loop ? (here > gap && here < 1 - gap ? here : 0.5) : 1
      else t = Math.max(gap, Math.min(1 - gap, here))
      next = [...keyframes, { ...view, t: r6(t) }].sort((a, b) => a.t - b.t)
      at = next.findIndex(k => k.t === r6(t))
    }
    setKeyframes(next)
    triggerPulse(at)
    if (!playing) setPlayhead(next[at].t)
  }
  const deleteHere = () => {
    if (onKey == null || onKey === 0) return
    let next = keyframes.filter((_, j) => j !== onKey)
    // Bounce: the end is always a key — the one before takes its place.
    if (!loop && onKey === n - 1 && next.length > 1) next = next.map((k, j) => j === next.length - 1 ? { ...k, t: 1 } : k)
    setKeyframes(next)
    showAt(heroScrub.t, next)
  }
  const setMode = (mode) => {
    if (mode === heroMotion.mode) return
    // Into a loop: ×(n−1)/n, making room for the way home. Back out: whatever
    // puts the last key on the end — exactly the inverse unless keys were
    // dragged in between, and never pushes a key past the end.
    const k = n > 1 ? (mode === 'loop' ? (n - 1) / n : 1 / keyframes[n - 1].t) : 1
    const next = keyframes.map((kf, i) => ({ ...kf, t: i === n - 1 && mode === 'bounce' && n > 1 ? 1 : r6(kf.t * k) }))
    useCartographStore.getState().setHeroShot(next, { mode })
    showAt(Math.min(1, heroScrub.t * k), next, { ...heroMotion, mode })
  }

  // ⭐ SCRUBBING NEVER WRITES THE KEYS (Jacob, 2026-09-28: "I was trying to edit the time slider and the keyframe
  // moved"). A plain press on a dot is the track's — it scrubs (and snaps onto the key, so a click goes there). Only
  // ⌥-drag (Alt) RETIMES a key; ⌥ without movement is a click. The first key, a bounce's end key and a loop's linked
  // end are pinned. ▶ node checks/claims-a-scrub-never-writes-the-keys.mjs
  const draggable = (i) => i > 0 && (loop || i < n - 1)
  const markerDown = (e, i) => {
    if (!e.altKey) return                       // the track scrubs
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { i, x0: e.clientX, moved: false }
  }
  const markerMove = (e) => {
    const g = drag.current
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    if (!g.moved && Math.abs(e.clientX - g.x0) < DRAG_PX) return
    g.moved = true
    if (g.i == null || !draggable(g.i)) return
    const lo = keyframes[g.i - 1].t + gap
    const hi = (g.i + 1 < n ? keyframes[g.i + 1].t : 1) - gap
    const t = r6(Math.max(lo, Math.min(hi, fracFromX(e.clientX))))
    setKeyframes(keyframes.map((k, j) => j === g.i ? { ...k, t } : k))
    if (!playing) setPlayhead(t)
  }
  const markerUp = (e) => {
    const g = drag.current
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (g && !g.moved) { if (g.i == null) { pause(); showAt(1) } else goTo(g.i) }
  }

  const btn = cardBtn
  // A key whose focus object differs from the one before it: the focus racks over the segment into it (◎ on the track).
  const focusIdsNow = keyframeFocusIds(keyframes)
  const focusChanges = focusIdsNow.map((id, i) => i > 0 && id !== focusIdsNow[i - 1])
  const marker = (x, i, linked) => {
    const active = !playing && (linked ? onKey === 0 && f > 0.5 : onKey === i && !(loop && i === 0 && f > 0.5))
    const pulsing = !linked && pulse === i
    const title = linked ? `${kfName(0)} again — the loop closes here · ${fmtSec(L)}`
      : `${kfName(i)} · ${fmtSec(x * L)}${draggable(i) ? ' — ⌥-drag to retime' : ''}`
    return (
      <div key={linked ? 'end' : i}
        onPointerDown={(e) => markerDown(e, linked ? null : i)}
        onPointerMove={markerMove} onPointerUp={markerUp} onPointerCancel={markerUp}
        title={title}
        className={`absolute w-[12px] h-[12px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 border touch-none cursor-pointer${pulsing ? ' hero-dot-pulse' : ''}`}
        style={{
          left: `${x * 100}%`,
          backgroundColor: linked ? 'transparent' : 'var(--vic-gold)',
          borderColor: linked ? 'var(--vic-gold)' : active || pulsing ? '#fff' : 'rgba(255,255,255,0.5)',
          borderWidth: active || linked ? 2 : 1,
          borderStyle: linked ? 'dashed' : 'solid',
          boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none',
          zIndex: pulsing ? 4 : 2,
        }}
      >{!linked && focusChanges[i] && (
        <span title={`${kfName(i)}: the focus racks here`} className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ bottom: 12, fontSize: 10, lineHeight: 1, color: 'var(--vic-gold)' }}>◎</span>
      )}</div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Transport: play/pause · speed · previous/next key ─────────── */}
      <div className="flex items-center gap-1.5">
        <button className="px-2 py-1 rounded text-caption font-medium cursor-pointer transition-colors"
          style={{
            background: playing ? 'var(--success-dim)' : 'var(--surface-container-high)',
            color: playing ? 'var(--success)' : 'var(--on-surface-variant)',
            border: `1px solid ${playing ? 'var(--success)' : 'var(--outline-variant)'}`,
          }}
          disabled={n < 2}
          title={playing ? 'Pause where it is' : n < 2 ? 'One key is a static shot — add a second to animate' : 'Play from the playhead'}
          onClick={playing ? pause : play}
        >{playing ? '⏸' : '▶'}</button>
        {[1, 10, 30].map(s => (
          <button key={s}
            onClick={() => setHeroMotion({ ...heroMotion, speed: s })}
            className="px-1.5 py-1 rounded text-caption cursor-pointer transition-colors"
            style={{
              background: (heroMotion.speed || 1) === s ? 'var(--surface-container-highest)' : 'transparent',
              color: (heroMotion.speed || 1) === s ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
            }}
          >{s}x</button>
        ))}
        <div className="flex-1" />
        <button className="px-2 py-1 rounded text-caption cursor-pointer" style={btn()} disabled={!n}
          title="Previous key" onClick={() => step(-1)}>‹</button>
        <button className="px-2 py-1 rounded text-caption cursor-pointer" style={btn()} disabled={!n}
          title="Next key" onClick={() => step(1)}>›</button>
      </div>

      {/* ── Timeline: drag anywhere to scrub (a key's dot too); click a key to go there; ⌥-drag a key to retime ── */}
      <div>
        <div
          ref={trackRef}
          className="relative h-6 flex items-center cursor-pointer select-none touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setScrubDragging(true)
            pause()
            scrubTo(fracFromX(e.clientX))
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
            scrubTo(fracFromX(e.clientX))
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
            setScrubDragging(false)
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
            setScrubDragging(false)
          }}
        >
          <div className="absolute inset-x-0 h-[6px] rounded-full top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ background: 'var(--surface-container-high)' }} />
          {keyframes.map((k, i) => marker(k.t, i, false))}
          {loop && n > 1 && marker(1, 0, true)}
          <div
            className="absolute w-[2px] h-[22px] -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none rounded-full"
            style={{
              left: `${f * 100}%`,
              backgroundColor: scrubDragging ? '#60a5fa' : playing ? '#4ade80' : 'var(--on-surface)',
              zIndex: 3,
            }}
          />
        </div>
        <div className="flex justify-between text-caption font-mono px-0.5" style={{ color: 'var(--on-surface-subtle)' }}>
          <span>0 s</span><span>{fmtSec(f * L)}</span><span>{fmtSec(L)}</span>
        </div>
        <div className="text-caption px-0.5" style={{ color: 'var(--on-surface-subtle)' }}>
          Drag to scrub · click a key to go there · ⌥-drag a key to retime it
        </div>
      </div>

      {/* ── Where you are ────────────────────────────────────────────── */}
      <div className="text-caption px-1" style={{ color: 'var(--on-surface-variant)' }}>
        {playing ? 'Playing — Key here keys this moment; ⏸ stops where it is.'
          : !n ? 'No keys yet — fly to the first view and key it.'
          : n === 1 && sel ? <>The static shot · {viewMatches ? <span style={{ color: 'var(--success)' }}>✓ the view is this key</span> : 'the view has moved — Key here keeps it'}</>
          : n === 1 ? 'A static shot — Key here adds a second key and makes it move.'
          : sel ? <>{kfName(onKey)} of {n} · {viewMatches ? <span style={{ color: 'var(--success)' }}>✓ the view is this key</span> : 'the view has moved — Key here keeps it'}</>
          : 'Between keys — Key here adds one at the playhead.'}
      </div>

      <div className="flex gap-1.5">
        <button className="hero-btn flex-1 py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
          style={sel && viewMatches ? btn({ color: 'var(--on-surface-subtle)' }) : btn({ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success)' })}
          onClick={keyHere}
          title={playing ? 'Key this moment — playback carries on' : sel ? `Replace ${kfName(onKey)} with the view` : 'Add the view as a key at the playhead'}
        >{!n ? 'Key the first view' : 'Key here'}</button>
        <button className="hero-btn px-3 py-2 rounded-lg text-body-sm cursor-pointer transition-all"
          style={btn({ background: 'transparent', color: 'var(--error)' })}
          disabled={onKey == null || onKey === 0}
          onClick={deleteHere}
          title={onKey === 0 ? 'The first key is the shot’s start — it stays' : onKey != null ? `Delete ${kfName(onKey)}` : 'Put the playhead on a key to delete it'}
        >Delete</button>
      </div>
      {sel && (
        <SliderRow label="FOV" value={sel.fov} min={5} max={120} suffix="°"
          onChange={(v) => {
            setKeyframes(keyframes.map((k, i) => i === onKey ? { ...k, fov: v } : k))
            pushCamera({ fov: v })
            triggerPulse(onKey)
          }} />
      )}
      {sel && <FocusRow keyframes={keyframes} onKey={onKey} setKeyframes={setKeyframes} />}

      <div className="text-caption px-1" style={{ color: 'var(--on-surface-subtle)' }}>
        Drag orbits · ⌥-drag moves · ⌘/⌃-drag pans · scroll zooms
      </div>

      <div style={{ borderTop: '1px solid var(--outline-variant)' }} />

      {/* ── The shot: its length and how it repeats ─────────────────── */}
      <SliderRow label="Length" value={L} min={10} max={1800} step={5} suffix=" s"
        onChange={(v) => setHeroMotion({ ...heroMotion, length: v })} />
      <div className="flex gap-1">
        {[
          { key: 'bounce', label: 'Bounce', desc: 'Plays to the last key, turns, and plays back' },
          { key: 'loop', label: 'Loop', desc: 'Travels on from the last key back to the first and carries on — a lighthouse turn' },
        ].map(o => {
          const active = heroMotion.mode === o.key
          return (
            <button key={o.key} onClick={() => setMode(o.key)} title={o.desc}
              className="flex-1 py-1.5 rounded text-caption transition-colors cursor-pointer"
              style={{
                background: active ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                border: `1px solid ${active ? 'var(--outline)' : 'var(--outline-variant)'}`,
              }}
            >{o.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function BrowseCamera({ cam }) {
  // Recover heading degrees from the live up vector. up = [sin θ, 0, -cos θ]
  // → θ = atan2(ux, -uz). Falls back to stored heading if up is degenerate.
  const headingFromUp = (() => {
    const [ux, , uz] = cam.up || [0, 0, -1]
    if (Math.hypot(ux, uz) < 1e-3) return getBrowseHeading()
    return Math.atan2(ux, -uz) * 180 / Math.PI
  })()
  // The slider reaches twice the town's own overhead fit (townRange.js), never LS's 2000 m.
  // ⛔ Unknown town size → the slider collapses and says so; never a guessed range.
  const boundary = useCartographStore(s => s.sceneBoundary)
  const altitudeMax = townRanges({ boundary, aspect: window.innerWidth / Math.max(1, window.innerHeight), fov: cam.fov })?.['town.browseAltitude']
  // The town's Browse frame — what playback opens on (src/camera/browseFrame.js). Authored only here, by the button:
  // panning is the working view, and authors nothing (Jacob, 2026-10-04). The counterpart of Hero's Key here.
  const frame = useCartographStore(s => s.browseFrame)
  const setShots = useCartographStore(s => s.setShots)
  const setBrowseFrame = useCartographStore(s => s.setBrowseFrame)
  const clearBrowseFrame = useCartographStore(s => s.clearBrowseFrame)
  const here = [Math.round(cam.target[0]), Math.round(cam.target[2])], hereAlt = Math.round(cam.position[1])
  const isHere = frame && frame.center[0] === here[0] && frame.center[1] === here[1] && frame.altitude === hereAlt
  return (
    <div className="space-y-2">
      <div className="text-caption px-1" style={{ color: 'var(--on-surface-variant)' }}>
        {!frame ? 'Browse frame: the town’s disc — frame a view and set it'
          : <>Browse frame · {frame.center[0]}, {frame.center[1]} · {frame.altitude} m · {isHere
            ? <span style={{ color: 'var(--success)' }}>✓ the view is the frame</span> : 'the view has moved'}</>}
      </div>
      <div className="flex gap-1.5">
        <button className="hero-btn flex-1 py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
          style={isHere ? cardBtn({ color: 'var(--on-surface-subtle)' }) : cardBtn({ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success)' })}
          onClick={() => setBrowseFrame(here, hereAlt)}
          title="Playback opens Browse on this view, fitted whole to every screen"
        >Set as Browse frame</button>
        <button className="hero-btn px-3 py-2 rounded-lg text-body-sm cursor-pointer transition-all"
          style={cardBtn({ background: 'transparent' })}
          disabled={!frame}
          onClick={clearBrowseFrame}
          title="Playback opens Browse on the town’s whole disc"
        >Town disc</button>
      </div>
      {!altitudeMax && <span className="text-caption" style={{ color: 'var(--error)' }}>Altitude: town size unknown</span>}
      <div className="flex gap-2">
        <div className="flex-1">
          <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Center X</span>
          <NumInput value={cam.target[0]} onChange={(v) =>
            pushCamera({ target: [v, cam.target[1], cam.target[2]], position: [v, cam.position[1], cam.target[2] + 1] })} />
        </div>
        <div className="flex-1">
          <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Center Z</span>
          <NumInput value={cam.target[2]} onChange={(v) =>
            pushCamera({ target: [cam.target[0], cam.target[1], v], position: [cam.target[0], cam.position[1], v + 1] })} />
        </div>
      </div>
      <SliderRow label="Altitude" value={cam.position[1]} min={50} max={altitudeMax || 50} suffix="m"
        onChange={(v) => pushCamera({ position: [cam.position[0], v, cam.position[2]] })} />
      {/* The town's Browse FOV (shots.browse.fov): every surface opens Browse at it, and the frame's square scales with it. */}
      <SliderRow label="FOV" value={cam.fov} min={10} max={90} suffix="°"
        onChange={(v) => { pushCamera({ fov: v }); setShots({ browse: { fov: v } }) }} />
      {/* Site-wide cosmetic screen-orientation. 0° = compass-N up. */}
      <SliderRow label="Heading" value={Math.round(headingFromUp)} min={-180} max={180} suffix="°"
        onChange={(v) => { setBrowseHeading(v); pushCamera({ up: browseUpFromHeading(v) }) }} />
    </div>
  )
}

function StreetCamera({ cam }) {
  // Eye height is ABOVE THE DRAWN GROUND at the eye's point (streetEyeY), never an
  // absolute Y: an absolute 1–5 m stood the eye underground on raised terrain.
  const [x, , z] = cam.position
  const ground = streetEyeY(x, z, 0)
  // Both are the town's authored Street shot (shots.street): every surface stands its Street eye by them.
  const setShots = useCartographStore(s => s.setShots)
  return (
    <div className="space-y-2">
      <SliderRow label="Eye Height" value={Math.round((cam.position[1] - ground) * 10) / 10} min={1} max={5} step={0.1} suffix="m" scale="body"
        onChange={(v) => { pushCamera({ position: [x, streetEyeY(x, z, v), z] }); setShots({ street: { eyeHeight: v } }) }} />
      <SliderRow label="FOV" value={cam.fov} min={30} max={120} suffix="°"
        onChange={(v) => { pushCamera({ fov: v }); setShots({ street: { fov: v } }) }} />
    </div>
  )
}

// ── Hero preview animation (runs inside R3F) ────────────────────────────────

export function HeroPreview({ keyframes, motion }) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls)
  const frameCount = useRef(0)
  // The path's { length, mode } — the first key's pose is read from it.
  const played = useMemo(() => ({ length: motion.length, mode: motion.mode }), [motion.length, motion.mode])

  // ⭐ OPEN ON THE FIRST KEY — once per entry into Hero, as soon as the keys are
  // there (they hydrate after a reload). It lives HERE, in the driver that is always
  // mounted in Hero, and not in the Camera card: the card's panel only mounts when
  // the card is open, so on a reload with it collapsed the first key was never shown
  // (Jacob, 2026-09-26: "clicking the word 'camera' fixes it").
  const opened = useRef(false)
  const n = keyframes.length
  useEffect(() => {
    if (opened.current || !n || !(motion.length > 0)) return
    opened.current = true
    heroScrub.t = 0
    notifyHeroScrub()
    const p = [0, 0, 0], q = [0, 0, 0]
    const { fov } = heroPoseAtTime(keyframes, played, 0, p, q)
    pushCamera({ position: p, target: q, fov })
  }, [n, motion.length, keyframes, played])

  useTownFrame(() => {
    // 0) Keep liveCamera fresh (Key here reads this synchronously)
    liveCamera.camera = camera
    liveCamera.controls = controls

    // 1) Drain panel pushes (position + target + fov from the scrub or a key).
    if (cameraPush.pending) {
      const u = cameraPush.pending
      cameraPush.pending = null
      if (u.position) camera.position.set(u.position[0], u.position[1], u.position[2])
      if (u.fov != null) { camera.fov = u.fov; camera.updateProjectionMatrix() }
      if (u.target) {
        camera.lookAt(u.target[0], u.target[1], u.target[2])
        if (controls) { controls.target.set(u.target[0], u.target[1], u.target[2]); controls.update() }
      }
    }

    // 3) Broadcast camera state to the panel (every 10 frames)
    if (++frameCount.current % 10 !== 0) return
    const t = controls?.target
    if (t) publishCameraState(camera, [t.x, t.y, t.z])
  })

  // Play is <Town>'s MovieCamera (the one driver — what is previewed here is what ships), reached through
  // useStageMovie below. ⛔ When not playing it touches nothing: the camera is the operator's (BRIEF-camera-regimes).
  return null
}

/** Stage's hooks into <Town movie>: playback starts FROM THE PLAYHEAD and writes it back; Play is `playing`. */
export function useStageMovie(keyframes, motion) {
  const length = motion.length
  const playing = !!motion.preview && keyframes.length > 1
  return useMemo(() => ({
    playing,
    start: () => heroScrub.t * length,
    onTime: (time) => { heroScrub.t = time / length; notifyHeroScrub() },
  }), [playing, length])
}

// ── Hook: subscribe to live camera state from outside R3F ────────────────────

function useCameraState() {
  const [cam, setCam] = useState({ ...cameraState })
  useEffect(() => subscribeCameraState(() => setCam({ ...cameraState })), [])
  return cam
}

// ── Collapsible section ─────────────────────────────────────────────────────

function Collapsible({ label, costMs, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const maxBarMs = 6 // full bar = 6ms
  const barPct = costMs != null ? Math.min(100, (costMs / maxBarMs) * 100) : 0
  const barColor = costMs > 4 ? 'var(--error)' : costMs > 2 ? 'var(--warning)' : 'var(--success)'

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 cursor-pointer py-0.5"
        onClick={() => setOpen(!open)}
      >
        <div className="section-heading flex items-center gap-1 shrink-0" style={{ minWidth: 0 }}>
          <span style={{ fontSize: 8, color: 'var(--on-surface-subtle)' }}>{open ? '▾' : '▸'}</span>
          {label}
        </div>
        {costMs != null && (
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-container-high)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: barColor }} />
            </div>
            <span className="text-caption font-mono shrink-0" style={{ color: 'var(--on-surface-subtle)', fontSize: 9 }}>
              {costMs.toFixed(1)}ms
            </span>
          </div>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

// ── Stage Panel ─────────────────────────────────────────────────────────────

/** Stage with no town open: why (the address's refusal, from authoringAddress.js#resolveTown), in place of the panel. */
export function StageNoTown() {
  const refused = useCartographStore(s => s.lookRefused), hydrated = useCartographStore(s => s._looksHydrated)
  if (!refused && !hydrated) return null
  return (
    <div className="absolute top-4 right-4 w-[400px] z-10 glass-panel rounded-xl p-3" role="alert" style={ALERT_STYLE}>
      <div className="section-heading mb-1">No town is open</div>
      <div className="text-body">{refused ?? 'Pick a Look to open its town.'}</div>
    </div>
  )
}

export function StagePanel({ shot, setShot, keyframes, setKeyframes, heroMotion, setHeroMotion, surfacesSlot, skyLightSlot, postSlot, lookForkSlot, shareSlot }) {
  const cam = useCameraState()

  return (
    <div className="absolute top-4 right-4 bottom-4 w-[400px] flex flex-col gap-3 z-10 pointer-events-none overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--outline-variant) transparent' }}>

      {/* Per-shot look override banner (channel-variant cascade) — appears at
          the top only once the active shot has recorded overrides ("Reset to
          Hero"). Owns its own container so it can render nothing. Provided by
          the cartograph chunk (store-bound); standalone /stage passes none. */}
      {lookForkSlot}

      {/* What failed in this town, and why (the one sink), portalled above the splash. Nothing when nothing failed. */}
      <FailuresBanner />

      {/* Time of Day — top slot for Preview parity. The weather row is Stage's own. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <div className="section-heading mb-2">Time of Day</div>
        <Timeline />
        <WeatherSwitch />
        {/* The wind the trees get, beside the weather it rides on (pills; session-only). */}
        <WindSwitch />
      </div>

      {/* Sky & Light — TOD-animatable atmospheric + lighting channels.
          Visible in all shots so the operator can author values from
          Browse (the default Stage entry-point from Designer). The
          underlying sky/celestial/haze geometry still skips render in
          Browse for perf — that's a separate concern from panel access. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Light & Sky">
          {skyLightSlot}
        </Collapsible>
      </div>

      {/* Horizon — the distance: the Arch or backdrop where the town has one, and the air (Mist, Halo). */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <HorizonControls />
      </div>

      {/* Light Sources — the man-made emitters: the lantern fixture, its ground
          pool + tree canopy glow, and the uplights (the Arch's, or the town's set-piece's). Grouped by intent
          (Phase A taxonomy reorg, 2026-06-30). Bloom (the global aura) + Neon
          join here in Phase B once their cascade-aware mounts are consolidated;
          the lamp fixture/pool/canopy restructure is Phase B too. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Light Sources">
          <LanternChannel />
          <LampGlowEditor />
          <Uplights />
        </Collapsible>
      </div>

      {/* Displays — the town's displays (src/displays), with Stage's preview. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <DisplaysSection />
      </div>

      {/* Surfaces — defaults to the standalone /stage mockup gallery; the
          cartograph passes its own store-bound material editor as
          `surfacesSlot` so per-Look styling lives here, not in a separate
          panel. Same visual home, real wiring. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Surfaces">
          {surfacesSlot}
        </Collapsible>
      </div>

      {/* Camera — per-shot authoring */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Camera">
          {shot === 'hero' && (
            <HeroCamera cam={cam} keyframes={keyframes} setKeyframes={setKeyframes}
              heroMotion={heroMotion} setHeroMotion={setHeroMotion} />
          )}
          {shot === 'browse' && <BrowseCamera cam={cam} />}
          {shot === 'street' && <StreetCamera cam={cam} />}
        </Collapsible>
      </div>

      {/* Share — the link-preview images, one per time of day, from this camera (src/cartograph/ShareCapture.jsx). */}
      {shareSlot && (
        <div className="glass-panel rounded-xl p-3 pointer-events-auto">
          <Collapsible label="Share Image">
            {shareSlot}
          </Collapsible>
        </div>
      )}

      {/* Image — camera/grade-side TOD channels (Tone & Color · Glow · Lens & Film).
          Visible in all shots. Renamed from "Post" (a render-mechanism word) to
          the intent it serves (Phase A taxonomy reorg, 2026-06-30). */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Image">
          {postSlot}
        </Collapsible>
      </div>

    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

// Default export removed: Stage is cartograph-hosted, not a standalone
// route. The /stage entry has been deleted (vite.config.js + stage.html
// + src/stage/main.jsx). Real Stage is mounted via CartographApp's
// Canvas + StagePanel. See feedback_stage_standalone_should_die.md.
