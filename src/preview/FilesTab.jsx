/**
 * FilesTab — the profiler's "files" tab: what each artifact cost to arrive, by class, each class opening onto its files.
 * Bytes over the wire and decoded (Resource Timing), fetch time, JSON parse and decode+upload time (the GL ledger,
 * glLedger.js), and whether it landed before WARD USABLE (the FIRST TRUTHFUL FRAME mark, src/lib/startupMarks.js).
 * The cold start's timeline is the strip chart's (phoneBus recordColdStart); this is its table.
 * ⚠️ Marks are set once per page: a soft reload does not re-mark. A cold number needs a page reload.
 * ⚠️ Source: locally the slab is read off the kit dev server's disk, so fetch time is not a visitor's network time.
 * `window.__startup()` returns the same report as data (for checks and the numbers table).
 */
import { useState } from 'react'
import { readStartupMarks } from '../lib/startupMarks.js'
import { ASSET_BASE_IS_REMOTE } from '../lib/bakedUrl.js'
import { artifactClass } from './artifactClass.js'
import { getLedger } from './glLedger.js'
import { getActiveProfileId } from './deviceProfiles'

const KB = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

export function startupReport() {
  const marks = readStartupMarks()
  const ftf = marks['first-truthful-frame'] ?? null
  const rows = new Map()
  const row = (cls) => { let r = rows.get(cls); if (!r) rows.set(cls, r = { cls, n: 0, transfer: 0, encoded: 0, decoded: 0, fetchMs: 0, lastEnd: 0, beforeFtf: 0, parseMs: 0, uploadMs: 0, uploadBytes: 0, files: [] }); return r }
  for (const e of performance.getEntriesByType('resource')) {
    const r = row(artifactClass(e.name))
    r.n++
    r.files.push({ name: e.name.split('?')[0].split('/').slice(-2).join('/'), transfer: e.transferSize, decoded: e.decodedBodySize, fetchMs: e.responseEnd - e.startTime, end: e.responseEnd, before: ftf != null && e.responseEnd <= ftf })
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

export default function FilesTab() {
  const [openCls, setOpenCls] = useState(null)
  const r = startupReport()
  const cell = (w) => ({ width: w, textAlign: 'right', flex: 'none' })
  return (
    <div>
      <div className="profiler-note" style={{ marginBottom: 4 }}>
        {r.target} · {r.source} · TIME TO WARD {r.timeToWard == null ? '—' : `${(r.timeToWard / 1000).toFixed(2)} s`} · reload the page for a cold number
      </div>
      <div className="profiler-head">
        <span style={{ flex: 1 }}>class · files (before usable)</span>
        <span style={cell(52)}>wire</span><span style={cell(52)}>decoded</span><span style={cell(44)}>fetch</span><span style={cell(38)}>parse</span><span style={cell(44)}>upload</span>
      </div>
      <div>
        {r.artifacts.map((a) => (
          <div key={a.cls}>
            <div className="profiler-row" onClick={() => setOpenCls(openCls === a.cls ? null : a.cls)} style={{ cursor: a.files.length ? 'pointer' : 'default' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.files.length ? (openCls === a.cls ? '▾ ' : '▸ ') : '  '}{a.cls} · {a.n} ({a.beforeFtf})</span>
              <span style={cell(52)}>{KB(a.transfer)}</span><span style={cell(52)}>{KB(a.decoded)}</span>
              <span style={cell(44)}>{Math.round(a.fetchMs)}</span><span style={cell(38)}>{Math.round(a.parseMs)}</span><span style={cell(44)}>{Math.round(a.uploadMs)}</span>
            </div>
            {openCls === a.cls && [...a.files].sort((x, y) => y.decoded - x.decoded).map((f, i) => (
              <div key={i} className="profiler-row profiler-sub">
                <span style={{ flex: 1, paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.before ? '■' : '□'} {f.name}</span>
                <span style={cell(52)}>{KB(f.transfer)}</span><span style={cell(52)}>{KB(f.decoded)}</span><span style={cell(44)}>{Math.round(f.fetchMs)}</span>
                <span style={cell(82)}>{`@${(f.end / 1000).toFixed(2)}s`}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="profiler-note" style={{ marginTop: 4 }}>
        wire = transferSize (0 from cache) · decoded = decodedBodySize · fetch = summed request ms · parse = JSON.parse ·
        upload = main-thread decode + GPU upload (KTX2 transcode runs in a worker: not counted) · ■ landed before WARD USABLE ·
        code = dev modules, unbundled: not what the Ward ships{r.unknownFormats.length ? ` · ⚠️ unsized texture formats: ${r.unknownFormats.join(', ')}` : ''}
      </div>
    </div>
  )
}
