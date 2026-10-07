/**
 * rgPageWorker — decodes a hero card's AO+DEPTH page (an RGBA PNG) into the RG8 bytes the GPU takes, OFF the main
 * thread (impostorTexture.js#loadImpostorTexture, channels 'rg').
 *
 * ⛔ WHY (Strobe, 2026-10-06, BRIEF-hero-arrival-perf): it was an <img> + canvas getImageData + a per-pixel loop on the
 * main thread, once per page. Huron has 144 of them (8 species × 18 pages), and in the operator's browser all 144 landed
 * in one burst at 4.35–4.55 s of arrival, on a 289 ms frame. The page still FETCHES each one (so its Resource Timing
 * entry is the page's: the files tab and the cold start see it); the blob comes here.
 *
 * In:  { id, blob }   Out: { id, width, height, rg } (rg transferred), or { id, error }.
 * The bytes are the old path's exactly: decoded with the browser's default colour handling (as an <img> drawn to a
 * canvas is), rows flipped bottom-up (a DataTexture's order), R = AO, G = depth.
 * ▶ scratch/frame-timeline/rg-identity.html proved it byte-identical on every page when it landed.
 */
self.onmessage = async ({ data: { id, blob } }) => {
  try {
    const bmp = await createImageBitmap(blob)
    const W = bmp.width, H = bmp.height
    const c = new OffscreenCanvas(W, H)
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(bmp, 0, 0)
    bmp.close()
    const px = g.getImageData(0, 0, W, H).data
    const rg = new Uint8Array(W * H * 2)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // image rows are top-down; a DataTexture's are bottom-up
      const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 2
      rg[o] = px[i]; rg[o + 1] = px[i + 1]
    }
    self.postMessage({ id, width: W, height: H, rg }, [rg.buffer])
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) })
  }
}
