// revetment.worker.js — the shore's stone, built off the frame (src/lib/revetmentBuild.js holds all of it; this is the
// thread's shell). `load` reads the slab here, off the main thread (loadRevetmentInit). A failure is SAID, with the
// request, and answered so the component can say which chunk is missing.
import { makeRevetmentBuilder, loadRevetmentInit } from '../lib/revetmentBuild.js'
const handle = makeRevetmentBuilder()
const said = (m, err) => self.postMessage({ type: 'error', gen: m?.gen, req: { type: m?.type, face: m?.face, k: m?.k, ci: m?.ci }, message: String(err?.stack || err) })
let latest = -Infinity     // a load superseded while its reads were in the air is dropped, never installed over the newer
self.onmessage = async (e) => {
  const m = e.data
  try {
    let msg = m
    if (m.type === 'load') { latest = Math.max(latest, m.gen); msg = await loadRevetmentInit(m); if (m.gen !== latest) return }
    const { reply, transfer } = handle(msg)
    self.postMessage(reply, transfer)
  } catch (err) { said(m, err) }
}
