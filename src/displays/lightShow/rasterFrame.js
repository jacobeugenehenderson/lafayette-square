/**
 * One look frame as RGBA at the drawer's frame size, safe across origins (staging, 2026-11-01: the frames come from the
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
 * `env` is the browser's (fetch, Image, URL); the check plants one. ▶ node checks/claims-a-failing-display-is-named-and-contained.mjs
 */
import { Refusal, Transient, httpFailure } from '../../lib/refusal.js'

export async function rasterFrame(src, w, h, ctx, env = globalThis) {
  let res
  try { res = await env.fetch(src) } catch (e) { throw new Transient(`the look frame ${src} did not answer: ${e?.message || e}`) }
  if (!res.ok) throw httpFailure(res, `the look frame ${src} answered ${res.status}`)
  const im = new env.Image()
  im.src = env.URL.createObjectURL(await res.blob())
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
