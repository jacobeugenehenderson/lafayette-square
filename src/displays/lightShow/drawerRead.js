/**
 * THE LIGHT SHOW DRAWER'S TWO READS OVER THE NETWORK, each failure built as the kind it is (src/lib/refusal.js):
 * readDrawerJson, the drawer (looks.json), and rasterFrame, each look frame. For both: no answer, or a body that breaks
 * off → Transient; a status → httpFailure (404 → Refusal; 5xx, 408, 429 → Transient); bytes that are not what they
 * claim (not JSON; not an image) → Refusal, since the same bytes give the same answer (LightShow's two Stage
 * mislabels, 2026-11-01: a malformed drawer and a missing frame both said "failed").
 *
 * rasterFrame: one look frame as RGBA at the drawer's frame size, safe across origins (staging, 2026-11-01: the frames come from the
 * asset host, and an <img> given their URL loads them in no-CORS mode and TAINTS the canvas, so getImageData threw
 * SecurityError inside onload, the promise never settled, and the show was silently absent).
 *   · the bytes are FETCHED (CORS mode: the host's Access-Control-Allow-Origin is what admits them), so the status is
 *     seen: a failed answer is httpFailure's, by name;
 *   · they are decoded from an OBJECT URL (same origin, so the canvas is never tainted) by the browser's own Image
 *     decoder, which reads the SVG frames a drawer holds (createImageBitmap does not; measured in Chrome 2026-11-01);
 *   · the drawing is in the awaited body, never a callback, so any throw rejects, naming the frame, as a Refusal (the
 *     same bytes decode and draw the same way on a second ask); useDrawer rethrows it at render, so DisplayBoundary
 *     puts it in the sink and a visitor is told.
 * ⚠️ fetch cannot tell a host that does not admit this origin (CORS) from a dead network: both are "did not answer".
 * Measured on staging 2026-11-01: the asset host omits `Vary: Origin` when no Origin is sent, so a browser that drew a
 * frame through an <img> (the player before this) holds an immutable copy the CORS fetch cannot use; that frame then
 * "did not answer" in that browser, named here, until its cache is cleared.
 * ⚠️ KNOWN, not handled: a fetch that stalls (no answer, no close) never settles, so the display stays absent with no
 * entry until the browser's own network timeout (Zob, 2026-11-01; the code before this had the same hole). A timeout of
 * our own is a ruling about a number, and none is made.
 * `env` is REQUIRED: { get (fetch), Image, URL }, handed in by LightShow.jsx. This module names no global, so it can
 * reach only what it is given (Zob's tier ruling: that is what keeps its check in npm test, and the check asserts it).
 * ▶ node checks/claims-a-failing-display-is-named-and-contained.mjs
 */
import { Refusal, Transient, httpFailure } from '../../lib/refusal.js'

const handed = (env, what) => { if (typeof env?.get !== 'function') throw new Refusal(`${what}: the read was handed no { get } to read it with`) }
async function answer(env, url, what) {
  let res
  try { res = await env.get(url) } catch (e) { throw new Transient(`${what} ${url} did not answer: ${e?.message || e}`) }
  if (!res.ok) throw httpFailure(res, `${what} ${url} answered ${res.status}`)
  return res
}
async function body(res, read, url, what) {
  try { return await res[read]() } catch (e) { throw new Transient(`${what} ${url} broke off: ${e?.message || e}`) }
}

/** The drawer's looks.json, parsed. Validating it is the caller's (engine.js#validateDrawer, a Refusal by name). */
export async function readDrawerJson(url, env) {
  handed(env, `the drawer ${url}`)
  const text = await body(await answer(env, url, 'the drawer'), 'text', url, 'the drawer')
  try { return JSON.parse(text) } catch (e) { throw new Refusal(`the drawer ${url} is not JSON: ${e.message}`) }
}

export async function rasterFrame(src, w, h, ctx, env) {
  handed(env, `the look frame ${src}`)
  if (!env.Image || !env.URL) throw new Refusal(`the look frame ${src}: rasterFrame was handed no Image and URL to decode it with`)
  const blob = await body(await answer(env, src, 'the look frame'), 'blob', src, 'the look frame')
  const im = new env.Image()
  im.src = env.URL.createObjectURL(blob)
  try {
    await im.decode()
    ctx.clearRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h).data
  } catch (e) {
    throw new Refusal(`the look frame ${src} did not draw: ${e?.message || e}`)
  } finally {
    env.URL.revokeObjectURL(im.src)
  }
}
