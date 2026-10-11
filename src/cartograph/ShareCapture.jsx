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
 * ⭐ THE ENLARGER (Jacob: "surprisingly useful to be able to see them all side by side"): a drawer showing the eight
 *    files Capture wrote, read from the slab on disk, large, with the slot names. It opens after a capture.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
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

/** The enlarger: the town's eight share images as Capture wrote them, side by side. Portalled: the card's glass would
 *  otherwise contain a fixed overlay. `rev` re-reads the files after a capture (same names on disk). */
function Enlarger({ lookId, rev, onClose }) {
  const [missing, setMissing] = useState({})
  return createPortal(
    <div className="glass-panel rounded-xl p-3" style={{ position: 'fixed', top: 16, left: 16, right: 432, bottom: 16, zIndex: 50,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="section-heading" style={{ flex: 1 }}>Share images · {lookId}</div>
        <button type="button" className="hero-btn px-3 py-1 rounded-lg text-body-sm cursor-pointer" onClick={onClose}>Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {TOD_SLOT_IDS.map((id) => (
          <figure key={id} style={{ margin: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {missing[id]
              ? <div className="text-caption" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--error)' }}>not captured</div>
              : <img src={slabUrl(lookId, shareImageRel(id), rev)} alt={getTodSlotLabel(id)}
                  onError={() => setMissing((m) => ({ ...m, [id]: true }))}
                  style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain', borderRadius: 8 }} />}
            <figcaption className="text-caption" style={{ textAlign: 'center', marginTop: 4 }}>{getTodSlotLabel(id)}</figcaption>
          </figure>
        ))}
      </div>
    </div>,
    document.body)
}

/** The panel: the button, and the enlarger showing the set. */
export default function ShareCapture({ playing }) {
  const lookId = useCartographStore((s) => s.activeLookId)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [rev, setRev] = useState(() => Date.now())
  const [msg, setMsg] = useState(null)   // { kind, text }

  async function capture() {
    setBusy(true); setMsg(null)
    try {
      if (playing) throw new Error('the Hero shot is playing — pause it (⏸) on the frame you want, then capture')
      const images = await captureSet()
      const r = await fetch(`/api/cartograph/looks/${encodeURIComponent(lookId)}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'save failed')
      setRev(Date.now()); setOpen(true)
      setMsg({ kind: 'ok', text: `${data.files.length} images · ${Math.round(data.files.reduce((n, f) => n + f.bytes, 0) / 1024)} KB · ship on the next Publish` })
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(false)
  }

  return (
    <div>
      <div className="section-heading mb-2">Share image</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="hero-btn flex-1 py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
          disabled={busy || !lookId} onClick={capture}
          title="Render this camera at every time of day and save one image per slot into the town's slab. A shared link sends the one for the time of day it is in the town.">
          {busy ? 'Capturing…' : '📷 Capture share images'}
        </button>
        <button className="hero-btn px-3 py-2 rounded-lg text-body-sm cursor-pointer transition-all" disabled={!lookId}
          aria-pressed={open} onClick={() => { if (!open) setRev(Date.now()); setOpen(!open) }}
          title="See the town's eight share images side by side, large">⤢</button>
      </div>
      {msg && <div className="text-caption mt-2" style={{ color: msg.kind === 'err' ? 'var(--error)' : 'var(--on-surface-variant)' }}>{msg.text}</div>}
      {open && lookId && <Enlarger key={`${lookId}:${rev}`} lookId={lookId} rev={rev} onClose={() => setOpen(false)} />}
    </div>
  )
}
