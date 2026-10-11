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
 * The clock is paused for the capture and put back after it, live or scrubbed, as it was.
 */
import { useState } from 'react'
import { addAfterEffect, useThree } from '@react-three/fiber'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCartographStore from './stores/useCartographStore.js'
import { getTodSlotMinutes, getTodSlotLabel } from './animatedParam.js'
import { TOD_SLOT_IDS } from '../lib/todSlots.js'
import { townDateAtMinute, townClockOf } from '../lib/townClock.js'

const SIZE = 1200   // px, square — the share image
// Frames drawn at a slot before it is read: the sky, light and shadows follow the clock each frame.
// ⚠️ How many a slot change needs to settle is not measured; check the set by eye.
const SETTLE_FRAMES = 12

let _gl = null
/** Mounted inside Stage's Canvas: hands the renderer to the capture. */
export function ShareCaptureGL() {
  _gl = useThree((s) => s.gl)
  return null
}

// The next frame, read straight after it is drawn (r3f's after-effect runs before the browser clears the buffer).
function frameAfter(n) {
  return new Promise((resolve) => {
    let left = n
    const off = addAfterEffect(() => {
      if (--left > 0) return
      off()
      const src = _gl.domElement, s = Math.min(src.width, src.height)
      const c = document.createElement('canvas')
      c.width = SIZE; c.height = SIZE
      c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, SIZE, SIZE)
      resolve(c.toDataURL('image/jpeg', 0.9))
    })
  })
}

async function captureSet() {
  if (!_gl?.domElement) throw new Error('Stage is not drawing yet')
  const tod = useTimeOfDay.getState()
  const was = { time: tod.currentTime, live: tod.isLive, paused: tod.isPaused }
  const mins = getTodSlotMinutes(was.time)
  const absent = TOD_SLOT_IDS.filter((id) => mins[id] == null)
  if (absent.length) throw new Error(`${absent.map(getTodSlotLabel).join(', ')} does not happen on ${townClockOf(was.time).date} here — pick another date`)
  tod.setPaused(true)
  const images = {}
  try {
    for (const id of TOD_SLOT_IDS) {
      useTimeOfDay.getState().setTime(townDateAtMinute(was.time, mins[id]))
      images[id] = await frameAfter(SETTLE_FRAMES)
    }
  } finally {
    const t = useTimeOfDay.getState()
    if (was.live) t.returnToLive(); else t.setTime(was.time)
    t.setPaused(was.paused)
  }
  return images
}

/** The panel: the button, and the set it made. */
export default function ShareCapture() {
  const lookId = useCartographStore((s) => s.activeLookId)
  const [busy, setBusy] = useState(false)
  const [set, setSet] = useState(null)   // { <slot>: dataUrl }
  const [msg, setMsg] = useState(null)   // { kind, text }

  async function capture() {
    setBusy(true); setMsg(null)
    try {
      const images = await captureSet()
      const r = await fetch(`/api/cartograph/looks/${encodeURIComponent(lookId)}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'save failed')
      setSet(images)
      setMsg({ kind: 'ok', text: `${data.files.length} images · ${Math.round(data.files.reduce((n, f) => n + f.bytes, 0) / 1024)} KB · ship on the next Publish` })
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(false)
  }

  return (
    <div>
      <div className="section-heading mb-2">Share image</div>
      <button className="hero-btn w-full py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
        disabled={busy || !lookId} onClick={capture}
        title="Render this camera at every time of day and save one image per slot into the town's slab. A shared link sends the one for the time of day it is in the town.">
        {busy ? 'Capturing…' : '📷 Capture share images'}
      </button>
      {msg && <div className="text-caption mt-2" style={{ color: msg.kind === 'err' ? 'var(--error)' : 'var(--on-surface-variant)' }}>{msg.text}</div>}
      {set && (
        <div className="grid grid-cols-4 gap-1 mt-2">
          {TOD_SLOT_IDS.map((id) => (
            <figure key={id} className="m-0">
              <img src={set[id]} alt={getTodSlotLabel(id)} className="w-full rounded" />
              <figcaption className="text-caption text-center">{getTodSlotLabel(id)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
