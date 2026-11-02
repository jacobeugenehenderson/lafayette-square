// _redsDelta.mjs — WHAT A RUN CHANGED AGAINST A RECORDED BASE RUN, so a merge cannot hide a new red among old ones
// (Boz's ask, 2026-11-01). Pure: no imports, no I/O. The runner (`run.mjs --against <sha>`) feeds it the base record and
// today's rows; `claims-a-merge-cannot-hide-a-red.mjs` mutation-tests it on planted pairs.
// ⭐ The base is MEASURED (`npm test -- --record`), never authored: a committed list of known reds would be a skip list.
// A row: { label, bucket: 'green'|'red'|'notChecked'|'blocked'|'timedOut', out: { stdout, stderr } } (sha1 of each
// stream, apart: their interleave varies under load, measured 2026-11-01, so a combined hash is not a fingerprint).
//
// BLOCKING (any one fails the gate):
//   new        — red, blocked or timed out now; at base green, not checked, or absent;
//   changed    — red at both, with different output (a red that grew, e.g. 11 unknown classes → 12);
//   unmeasured — measured at base (green or red), not checked now: a check that lost its data hides what it would find;
//   gone       — red at base, absent now (a red check deleted, or no longer in this tier).
// NOT BLOCKING, listed: same (red at both, same output) · fixed (red at base, green now).
export function redsDelta(base, today) {
  if (!Array.isArray(base?.rows)) throw new Error('redsDelta: the base record carries no `rows` — nothing to compare against')
  const FAIL = new Set(['red', 'blocked', 'timedOut'])
  const was = new Map(base.rows.map(r => [r.label, r])), is = new Map(today.map(r => [r.label, r]))
  const d = { new: [], changed: [], unmeasured: [], gone: [], same: [], fixed: [] }
  for (const [label, r] of is) {
    const b = was.get(label)
    if (FAIL.has(r.bucket)) {
      if (!b || !FAIL.has(b.bucket)) d.new.push({ label, was: b?.bucket ?? 'absent', is: r.bucket })
      else if (b.bucket !== r.bucket || b.out?.stdout !== r.out?.stdout || b.out?.stderr !== r.out?.stderr) d.changed.push({ label, was: b.bucket, is: r.bucket })
      else d.same.push({ label })
    } else if (r.bucket === 'notChecked' && b && b.bucket !== 'notChecked') d.unmeasured.push({ label, was: b.bucket })
    else if (r.bucket === 'green' && b && FAIL.has(b.bucket)) d.fixed.push({ label, was: b.bucket })
  }
  for (const [label, b] of was) if (!is.has(label) && FAIL.has(b.bucket)) d.gone.push({ label, was: b.bucket })
  return d
}

export const blockingCount = (d) => d.new.length + d.changed.length + d.unmeasured.length + d.gone.length

// One line per row of the delta, blocking kinds first.
export function deltaLines(d) {
  return [
    ...d.new.map(x => `⛔ NEW         ${x.label}  (${x.was} → ${x.is})`),
    ...d.changed.map(x => `⛔ CHANGED     ${x.label}  (red at base, its output differs now)`),
    ...d.unmeasured.map(x => `⛔ UNMEASURED  ${x.label}  (${x.was} at base, not checked now)`),
    ...d.gone.map(x => `⛔ GONE        ${x.label}  (${x.was} at base, not run now)`),
    ...d.fixed.map(x => `✅ FIXED       ${x.label}  (${x.was} at base, green now)`),
    ...d.same.map(x => `   same        ${x.label}`),
  ]
}
