/**
 * ShareCapture — the town's SHARE IMAGES, captured in Stage (BRIEF-share-image-by-time-of-day).
 *
 * One press renders Stage's current camera at EVERY time-of-day slot, on the day Stage is set to, and writes one
 * square JPEG per slot into the town's own slab (`POST /looks/<id>/share` → `public/baked/<id>/share/<slot>.jpg`).
 * Publish carries them like any other slab file and refuses a town without them; the site Workers send the one for
 * the slot it is in the town when the link is opened (src/lib/shareCard.js). The operator sees the set it made.
 *
 * ⛔ A slot the sun does not reach on Stage's date (Night, above ~48.6°N near the June solstice) refuses by name:
 *    pick another date. A set is all slots or nothing.
 * ⛔ ONE CAMERA, EIGHT TIMES — never eight camera spots. Capture refuses while the Hero shot plays, and every image is
 *    read only if the camera's pose is the one the press started on; any move (a tween, damping, a hand) aborts the set.
 * ⭐ ALWAYS CLEAR WEATHER (Jacob, 2026-10-11): Capture stands the scene in Stage's Clear for the whole run, whatever the
 *    operator has chosen, and waits for it to land. The wind is left as it is ("the effect is negligible"). The clock
 *    is paused for the capture; afterwards the operator's own weather and time come back as they were.
 * ⭐ THE SET, IN THE CARD (Jacob: "surprisingly useful to be able to see them all side by side"): the eight files
 *    Capture wrote, read from the slab on disk, four to a row (a toggle: two) with the slot names. No overlay. The button
 *    reads Recapture once the town has a full set.
 */
import { useState } from 'react'
import { addAfterEffect, useThree } from '@react-three/fiber'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useCartographStore from './stores/useCartographStore.js'
import { getTodSlotMinutes, getTodSlotLabel } from './animatedParam.js'
import { TOD_SLOT_IDS } from '../lib/todSlots.js'
import { townDateAtMinute, townClockOf, townMinuteOf } from '../lib/townClock.js'
import { slabUrl } from '../lib/slabUrl.js'
import { shareImageRel } from '../lib/shareCard.js'

const SIZE = 1200   // px, square — the share image
// The weather every share image is taken in: Stage's Weather switch's Clear (Jacob's ruling, 2026-10-11).
const SHARE_WEATHER = 'clear'
// ⛔ A signal that never comes is a failure, never a picture: past this the capture stops and says which slot and which state.
const SETTLE_TIMEOUT_MS = 15000

let _three = null
/** Mounted inside Stage's Canvas: hands the renderer and the camera to the capture. */
export function ShareCaptureGL() {
  _three = useThree()
  return null
}

const poseOf = (cam) => [...cam.matrixWorld.elements, cam.fov, cam.zoom].join(',')
const moved = () => new Error('the camera moved during the capture — nothing was saved. Hold still (pause the Hero shot) and press again')

// Resolves on the first drawn frame after which `pred()` holds; rejects, naming `what`, if it does not within the timeout.
function until(pred, what, pose) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const off = addAfterEffect(() => {
      if (poseOf(_three.camera) !== pose) { off(); reject(moved()); return }
      if (pred()) { off(); resolve(); return }
      if (performance.now() - t0 > SETTLE_TIMEOUT_MS) { off(); reject(new Error(`${what} did not land within ${SETTLE_TIMEOUT_MS / 1000} s — nothing was saved`)) }
    })
  })
}

// The frame `n` frames from now, read straight after it is drawn (r3f's after-effect runs before the browser clears it).
function frameAfter(n, pose) {
  return new Promise((resolve, reject) => {
    let left = n
    const off = addAfterEffect(() => {
      if (--left > 0) return
      off()
      if (poseOf(_three.camera) !== pose) { reject(moved()); return }
      const src = _three.gl.domElement, s = Math.min(src.width, src.height)
      const c = document.createElement('canvas')
      c.width = SIZE; c.height = SIZE
      c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, SIZE, SIZE)
      resolve(c.toDataURL('image/jpeg', 0.9))
    })
  })
}

/**
 * Move the clock to `when` and wait until the frame shows it. Nothing the clock drives is read on a frame count:
 *   · the SUN — CelestialBodies recomputes the light from the clock on render and pushes it to the sky store after
 *     the commit (`setCelestial` → `sunElevation`); the store moving is the commit having landed.
 *   · the WEATHER — a time change re-selects the directive and would EASE to it over 45 s
 *     (AtmosphereDirectiveDriver). A snap is requested, so it lands at once; landed = the published (tweened)
 *     directive IS the new raw one. Under Clear there is no wetness or snow for the snap to reset.
 *   · the SHADOW MAP — redrawn on the first frame after the light moves (CelestialBodies' >10 m rule; slots are
 *     hours apart), so that frame draws it and the NEXT one is read.
 * Everything else the clock drives (sky colour, exposure, bloom, lamps, neon, uplights) is a function of the clock
 * evaluated every frame, with no easing.
 */
async function settleAt(when, what, pose) {
  const sky = useSkyState.getState(), atm = useAtmosphere.getState()
  const elev0 = sky.sunElevation, raw0 = atm.rawDirective
  atm.requestSnap()
  useTimeOfDay.getState().setTime(when)
  await until(() => useSkyState.getState().sunElevation !== elev0, `${what}: the sun`, pose)
  await until(() => {
    const a = useAtmosphere.getState()
    return a.rawDirective !== raw0 && !a.snapPending && a.tweenedDirective === a.rawDirective
  }, `${what}: the weather`, pose)
}

async function captureSet() {
  if (!_three?.gl?.domElement) throw new Error('Stage is not drawing yet')
  const pose = poseOf(_three.camera)
  const tod = useTimeOfDay.getState()
  const was = { time: tod.currentTime, live: tod.isLive, paused: tod.isPaused }
  const mins = getTodSlotMinutes(was.time)
  const absent = TOD_SLOT_IDS.filter((id) => mins[id] == null)
  if (absent.length) throw new Error(`${absent.map(getTodSlotLabel).join(', ')} does not happen on ${townClockOf(was.time).date} here — pick another date`)
  const cart = useCartographStore.getState()
  const wasWeather = cart.weatherMode
  tod.setPaused(true)
  const images = {}
  try {
    if (wasWeather !== SHARE_WEATHER) {
      // Stage's switch stands the preset with a snap (WeatherPoller); landed = the feed paused on it and its directive published.
      const raw0 = useAtmosphere.getState().rawDirective
      cart.setWeatherMode(SHARE_WEATHER)
      await until(() => {
        const a = useAtmosphere.getState()
        return useSkyState.getState().feedPaused && a.rawDirective !== raw0 && !a.snapPending && a.tweenedDirective === a.rawDirective
      }, 'Clear weather', pose)
    }
    for (const id of TOD_SLOT_IDS) {
      const when = townDateAtMinute(was.time, mins[id])
      // Already on this minute, the clock would not move and nothing would re-land: step off it first.
      if (Math.abs(townMinuteOf(useTimeOfDay.getState().currentTime) - townMinuteOf(when)) < 1) {
        await settleAt(new Date(when.getTime() - 30 * 60000), getTodSlotLabel(id), pose)
      }
      await settleAt(when, getTodSlotLabel(id), pose)
      images[id] = await frameAfter(2, pose)
    }
  } finally {
    if (wasWeather !== SHARE_WEATHER) useCartographStore.getState().setWeatherMode(wasWeather)
    const t = useTimeOfDay.getState()
    useAtmosphere.getState().requestSnap()   // the operator's own sky lands at once, as it was
    if (was.live) t.returnToLive(); else t.setTime(was.time)
    t.setPaused(was.paused)
  }
  return images
}

/** The town's share images as Capture wrote them, read from the slab on disk, `cols` to a row at the panel's width,
 *  slot name under each. `rev` re-reads the files after a capture (same names on disk). Reports which slots have a file. */
function ShareImages({ lookId, rev, cols, onState }) {
  const [state, setState] = useState({})   // { <slot>: 'ok' | 'missing' }
  const mark = (id, v) => setState((m) => { const n = { ...m, [id]: v }; onState(n); return n })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: cols > 2 ? 4 : 6 }}>
      {TOD_SLOT_IDS.map((id) => (
        <figure key={id} style={{ margin: 0 }}>
          {state[id] === 'missing'
            ? <div className="text-caption" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: 6,
                background: 'var(--surface-container-high)', color: 'var(--error)' }}>not captured</div>
            : <img src={slabUrl(lookId, shareImageRel(id), rev)} alt={getTodSlotLabel(id)}
                onLoad={() => mark(id, 'ok')} onError={() => mark(id, 'missing')}
                style={{ display: 'block', width: '100%', aspectRatio: '1', borderRadius: 6 }} />}
          <figcaption className="text-caption" style={{ textAlign: 'center', marginTop: 2 }}>{getTodSlotLabel(id)}</figcaption>
        </figure>
      ))}
    </div>
  )
}

// Four to a row (compact) by default; the toggle switches to two (closer to real size). Remembered per viewer only.
const COLS_KEY = 'cartograph.shareImages.cols'
function readCols() { try { return localStorage.getItem(COLS_KEY) === '2' ? 2 : 4 } catch { return 4 } }
function writeCols(n) { try { localStorage.setItem(COLS_KEY, String(n)) } catch { /* the choice just isn't remembered */ } }

/** The Share image card's body (Stage wraps it in its collapsible card): the button, the line, the set. */
export default function ShareCapture({ playing }) {
  const lookId = useCartographStore((s) => s.activeLookId)
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState(() => Date.now())
  const [have, setHave] = useState({})
  const [msg, setMsg] = useState(null)   // { kind, text }
  const [cols, setCols] = useState(readCols)
  const hasSet = TOD_SLOT_IDS.every((id) => have[id] === 'ok')

  async function capture() {
    setBusy(true); setMsg(null)
    try {
      if (playing) throw new Error('the Hero shot is playing — pause it (⏸) on the frame you want, then capture')
      const images = await captureSet()
      const r = await fetch(`/api/cartograph/looks/${encodeURIComponent(lookId)}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'save failed')
      setRev(Date.now())
      setMsg({ kind: 'ok', text: `${data.files.length} images · ${Math.round(data.files.reduce((n, f) => n + f.bytes, 0) / 1024)} KB · ship on the next Publish` })
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(false)
  }

  return (
    <div>
      <button className="hero-btn w-full py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
        disabled={busy || !lookId} onClick={capture}
        title="Render this camera at every time of day and save one image per slot into the town's slab. A shared link sends the one for the time of day it is in the town.">
        {busy ? 'Capturing…' : hasSet ? '📷 Recapture' : '📷 Capture share images'}
      </button>
      {msg && <div className="text-caption mt-2" style={{ color: msg.kind === 'err' ? 'var(--error)' : 'var(--on-surface-variant)' }}>{msg.text}</div>}
      {lookId && (
        <div className="mt-2">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <button type="button" className="text-caption cursor-pointer" style={{ color: 'var(--on-surface-subtle)' }}
              onClick={() => { const n = cols === 4 ? 2 : 4; setCols(n); writeCols(n) }}
              title={cols === 4 ? 'Show two to a row, closer to real size' : 'Show four to a row'}>
              {cols === 4 ? '⤢ larger' : '⤡ compact'}
            </button>
          </div>
          <ShareImages key={`${lookId}:${rev}`} lookId={lookId} rev={rev} cols={cols} onState={setHave} />
        </div>
      )}
    </div>
  )
}
