/**
 * StartupPanel — the cold start of this page, as the spec names it: HTML → application runtime → scene manifest →
 * minimum ground → minimum buildings → FIRST TRUTHFUL FRAME (= WARD USABLE) → progressive; TIME TO WARD; and what each
 * artifact cost to arrive: bytes over the wire, bytes on arrival, bytes decoded, fetch time, parse and upload time.
 *
 * Instruments, each named on screen: the marks (src/lib/startupMarks.js, set by the shared renderer), the browser's
 * Resource Timing (fetch time and sizes), and the GL ledger (src/preview/glLedger.js: parse, decode+upload).
 * ⚠️ Marks are set once per page: a soft reload does not re-mark. A cold number needs a page reload.
 * ⚠️ Source: locally the slab is read off the kit dev server's disk, so fetch time is not a visitor's network time.
 * The `source` line says which. `window.__startup()` returns the same report as data (for checks and the numbers table).
 */
import { useEffect, useState } from 'react'
import { STARTUP_SEQUENCE, readStartupMarks } from '../lib/startupMarks.js'
import { ASSET_BASE_IS_REMOTE } from '../lib/bakedUrl.js'
import { artifactClass } from './artifactClass.js'
import { getLedger } from './glLedger.js'
import { getActiveProfileId } from './deviceProfiles'

const KB = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const MS = (v) => (v == null ? '—' : `${Math.round(v)} ms`)

export function startupReport() {
  const marks = readStartupMarks()
  const ftf = marks['first-truthful-frame'] ?? null
  const rows = new Map()
  const row = (cls) => { let r = rows.get(cls); if (!r) rows.set(cls, r = { cls, n: 0, transfer: 0, encoded: 0, decoded: 0, fetchMs: 0, lastEnd: 0, beforeFtf: 0, parseMs: 0, uploadMs: 0, uploadBytes: 0 }); return r }
  for (const e of performance.getEntriesByType('resource')) {
    const r = row(artifactClass(e.name))
    r.n++
    r.transfer += e.transferSize; r.encoded += e.encodedBodySize; r.decoded += e.decodedBodySize
    r.fetchMs += e.responseEnd - e.startTime
    r.lastEnd = Math.max(r.lastEnd, e.responseEnd)
    if (ftf != null && e.responseEnd <= ftf) r.beforeFtf++
  }
  const L = getLedger()
  for (const p of L.parses) row(p.cls).parseMs += p.ms
  for (const u of L.uploads) { const r = row(u.cls || 'unattributed'); r.uploadMs += u.ms; r.uploadBytes += u.bytes }
  return {
    target: getActiveProfileId(),
    source: ASSET_BASE_IS_REMOTE ? 'network (the asset host this build names)' : `disk via the kit dev server (${location.host})`,
    marks,
    timeToWard: ftf,
    artifacts: [...rows.values()].sort((a, b) => b.decoded - a.decoded),
    unknownFormats: [...L.unknownFormats],
  }
}

if (typeof window !== 'undefined') window.__startup = startupReport

export default function StartupPanel() {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    // Re-read while the load is still arriving, then stop.
    const id = setInterval(() => { tick((n) => n + 1); if (readStartupMarks().trees) setTimeout(() => clearInterval(id), 3000) }, 500)
    return () => clearInterval(id)
  }, [])
  const r = startupReport()
  let prev = 0
  return (
    <div className="glass-panel rounded-xl p-3" style={{ fontSize: 11 }}>
      <button className="section-heading" onClick={() => setOpen(!open)} style={{ cursor: 'pointer', background: 'none', border: 0, padding: 0, color: 'inherit' }}>
        {open ? '▾' : '▸'} startup · TIME TO WARD {MS(r.timeToWard)}
      </button>
      {open && <>
        <div className="glass-text-dim" style={{ fontSize: 9, margin: '4px 0 6px', lineHeight: 1.4 }}>
          target {r.target} (emulated on this desktop's GPU) · source {r.source} · marks once per page: reload the page for a cold number
        </div>
        {STARTUP_SEQUENCE.map((s) => {
          const t = r.marks[s.id]
          const d = t != null ? t - prev : null
          if (t != null) prev = t
          return (
            <div key={s.id} className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px', fontWeight: s.id === 'first-truthful-frame' ? 700 : 400 }}>
              <span style={{ flex: 1 }} className={s.blocking ? '' : 'glass-text-dim'}>{s.blocking ? '■' : '□'} {s.label}</span>
              <span style={{ width: 60, textAlign: 'right' }}>{MS(t)}</span>
              <span style={{ width: 60, textAlign: 'right' }} className="glass-text-dim">{d != null ? `+${Math.round(d)}` : ''}</span>
            </div>
          )
        })}
        <div className="glass-text-dim" style={{ fontSize: 9, marginTop: 4 }}>■ before WARD USABLE · □ arrives after</div>
        <div className="section-heading" style={{ marginTop: 8 }}>per artifact</div>
        <div className="flex font-mono glass-text-dim" style={{ fontSize: 9 }}>
          <span style={{ flex: 1 }}>class · files (landed before usable)</span>
          <span style={{ width: 52, textAlign: 'right' }}>wire</span><span style={{ width: 52, textAlign: 'right' }}>decoded</span>
          <span style={{ width: 44, textAlign: 'right' }}>fetch</span><span style={{ width: 40, textAlign: 'right' }}>parse</span><span style={{ width: 44, textAlign: 'right' }}>upload</span>
        </div>
        {r.artifacts.map((a) => (
          <div key={a.cls} className="flex font-mono" style={{ fontSize: 10, lineHeight: '15px' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.cls} · {a.n} ({a.beforeFtf})</span>
            <span style={{ width: 52, textAlign: 'right' }}>{KB(a.transfer)}</span><span style={{ width: 52, textAlign: 'right' }}>{KB(a.decoded)}</span>
            <span style={{ width: 44, textAlign: 'right' }}>{Math.round(a.fetchMs)}</span><span style={{ width: 40, textAlign: 'right' }}>{Math.round(a.parseMs)}</span>
            <span style={{ width: 44, textAlign: 'right' }}>{Math.round(a.uploadMs)}</span>
          </div>
        ))}
        <div className="glass-text-dim" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
          wire = transferSize (0 when served from cache) · decoded = decodedBodySize · fetch = summed request time (ms, overlapping)
          · parse = JSON.parse · upload = main-thread decode + GPU upload (KTX2 transcode runs in a worker: not counted) · code = dev
          modules, unbundled: not what the Ward ships{r.unknownFormats.length ? ` · ⚠️ texture formats with no known size: ${r.unknownFormats.join(', ')}` : ''}
        </div>
      </>}
    </div>
  )
}
