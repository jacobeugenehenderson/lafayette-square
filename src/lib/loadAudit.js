/**
 * loadAudit.js — a temporary startup asset-load profiler (opt-in via ?loadAudit).
 *
 * Answers "what does a cold load actually pull, and does the hero frame need it?"
 * with a real network manifest instead of a guess (proxy renders don't count —
 * this reads the browser's own resource-timing). Never runs unless ?loadAudit is
 * in the URL, so it's inert in prod.
 *
 * Uses PerformanceObserver('resource') to catch EVERY fetch from boot, buckets
 * them by role, tags each hero-critical vs deferrable, and prints a summary:
 *   - total transfer bytes + count, split hero-critical / deferred
 *   - the biggest offenders, sorted
 *   - the load timeline (when each bucket's first/last byte landed)
 *
 * Auto-dumps once the load quiets (no new resource for QUIET_MS), and also on
 * demand via window.__loadAudit(). Categories are kit-generic (any scene).
 */
const QUIET_MS = 2500      // dump once no new resource has arrived for this long
const MAX_WAIT_MS = 20000  // hard backstop so we always dump even on a busy tab

// URL → { bucket, heroCritical }. Order matters: first match wins.
function classify(url) {
  const u = url.split('?')[0]
  if (/\/trees\/overhead\/.*\.png$/.test(u))         return { bucket: 'overhead-disc-png', hero: false }
  if (/-lod0\.glb$/.test(u))                          return { bucket: 'mesh-glb-lod0 (street)', hero: false }
  if (/-lod2\.glb$/.test(u))                          return { bucket: 'mesh-glb-lod2 (browse)', hero: false }
  if (/-lod1\.glb$/.test(u))                          return { bucket: 'mesh-glb-lod1 (HERO)', hero: true }
  if (/\.glb$/.test(u))                               return { bucket: 'mesh-glb (other)', hero: true }
  if (/trees-atlas\.json$/.test(u))                   return { bucket: 'tree-atlas-json', hero: true }
  if (/\/trees\/.*\.(png|ktx2|webp)$/.test(u) || /trees-atlas.*\.(png|ktx2|webp)$/.test(u))
                                                      return { bucket: 'tree-atlas-texture', hero: true }
  if (/\/baked\/.*\/trees\.json$/.test(u))            return { bucket: 'placements-trees.json', hero: true }
  if (/lamps\.json$/.test(u) || /lamp.*\.png$/i.test(u)) return { bucket: 'lamps', hero: true }
  if (/(ground|terrain)\b.*\.(json|png|bin)$/.test(u)) return { bucket: 'ground/terrain', hero: true }
  if (/scene\.json$/.test(u))                         return { bucket: 'scene.json', hero: true }
  if (/buildings?\.json$/.test(u) || /\/baked\/.*building/.test(u)) return { bucket: 'buildings', hero: true }
  if (/\.(js|mjs|css)$/.test(u))                      return { bucket: 'app-code (js/css)', hero: true }
  return { bucket: 'other', hero: true }
}

function fmtKB(bytes) { return `${(bytes / 1024).toFixed(0)} KB` }

export function initLoadAudit() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has('loadAudit')) return
  if (window.__loadAuditStarted) return
  window.__loadAuditStarted = true

  const t0 = performance.now()
  const rows = []            // { url, bucket, hero, bytes, start, end }
  let dumped = false
  let quietTimer = null

  const record = (e) => {
    // transferSize is 0 for cached/opaque; fall back to encoded/decoded body size
    const bytes = e.transferSize || e.encodedBodySize || e.decodedBodySize || 0
    const { bucket, hero } = classify(e.name)
    rows.push({ url: e.name, bucket, hero, bytes, start: e.startTime, end: e.responseEnd })
  }

  const dump = (reason) => {
    if (dumped) return
    dumped = true
    if (quietTimer) clearTimeout(quietTimer)
    const byBucket = new Map()
    let heroBytes = 0, defBytes = 0, heroN = 0, defN = 0
    for (const r of rows) {
      const b = byBucket.get(r.bucket) || { bucket: r.bucket, hero: r.hero, bytes: 0, n: 0, first: Infinity, last: 0 }
      b.bytes += r.bytes; b.n++; b.first = Math.min(b.first, r.start); b.last = Math.max(b.last, r.end)
      byBucket.set(r.bucket, b)
      if (r.hero) { heroBytes += r.bytes; heroN++ } else { defBytes += r.bytes; defN++ }
    }
    const buckets = [...byBucket.values()].sort((a, b) => b.bytes - a.bytes)
    // DEV NOISE vs REAL PAYLOAD: in `vite dev` every source module is its own
    // unbundled, unminified request (+ sourcemaps) — hundreds of them — which do
    // NOT exist in the production build. Split them out so the number that
    // actually transfers to a device (the binary assets: glb/png/ktx2/json) is
    // legible. app-code js/css is the dev-only bucket.
    const isCode = (b) => b.bucket === 'app-code (js/css)'
    const assetBytes = buckets.filter(b => !isCode(b)).reduce((s, b) => s + b.bytes, 0)
    const assetN = buckets.filter(b => !isCode(b)).reduce((s, b) => s + b.n, 0)
    const codeBytes = buckets.filter(isCode).reduce((s, b) => s + b.bytes, 0)
    const assetHero = buckets.filter(b => !isCode(b) && b.hero).reduce((s, b) => s + b.bytes, 0)
    const assetDefer = buckets.filter(b => !isCode(b) && !b.hero).reduce((s, b) => s + b.bytes, 0)

    const L = []
    L.push(`[loadAudit] cold-load manifest (${reason}) — ${rows.length} requests, ${fmtKB(heroBytes + defBytes)} total`)
    L.push(`  REAL ASSETS (prod-representative): ${assetN} req, ${fmtKB(assetBytes)}   [HERO ${fmtKB(assetHero)} | defer ${fmtKB(assetDefer)}]`)
    L.push(`  app-code js/css (DEV-ONLY, gone in prod build): ${fmtKB(codeBytes)}`)
    L.push(`  ── buckets (biggest first) ──`)
    for (const b of buckets) {
      L.push(`  ${(b.hero ? 'HERO ' : 'defer')}  ${fmtKB(b.bytes).padStart(9)}  ${String(b.n).padStart(4)} req  ${b.bucket}`)
    }
    L.push(`  ── biggest single assets ──`)
    for (const r of [...rows].filter(r => classify(r.url).bucket !== 'app-code (js/css)').sort((a, b) => b.bytes - a.bytes).slice(0, 12)) {
      L.push(`  ${(r.hero ? 'HERO ' : 'defer')}  ${fmtKB(r.bytes).padStart(9)}  ${r.url.split('/').slice(-2).join('/')}`)
    }
    L.push(`  → window.__loadAudit() re-dumps · window.__loadAuditData has the raw rows · re-run without ?loadAudit to disable`)
    // Single multi-line string = one clean copy-paste (no console.table).
    // eslint-disable-next-line no-console
    console.log(L.join('\n'))
    window.__loadAuditData = { rows, buckets, assetBytes, codeBytes, assetHero, assetDefer }
  }

  const bump = () => {
    if (quietTimer) clearTimeout(quietTimer)
    quietTimer = setTimeout(() => dump('load quiesced'), QUIET_MS)
  }

  // Backfill anything already loaded before we attached, then observe.
  for (const e of performance.getEntriesByType('resource')) record(e)
  const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) record(e); bump() })
  obs.observe({ type: 'resource', buffered: true })
  bump()
  setTimeout(() => dump('max-wait backstop'), MAX_WAIT_MS)
  window.__loadAudit = () => { dumped = false; dump('manual') }
  // eslint-disable-next-line no-console
  console.log('%c[loadAudit] armed — will summarize the cold load once it quiets.', 'color:#2a7')
}
