// refuse-probe.mjs — READ-ONLY (Boz's curbWidth ruling, 2026-10-19): build each named town through the proto feed and report
// whether the producer refused, and with what. A town with an authored curb must get PAST the curb gate (its build is not run
// to completion here: --gate-only stops at the first throw or after the call returns). Run through sweep/run.sh so the
// branch's modules are swapped in.   CHECK=scratch/ground-budget/curbwidth/refuse-probe.mjs TOWNS="…" …/sweep/run.sh src/lib/tileGround.js
import { feed, buildProto, feedScenes } from '../../_proto-feed.mjs'
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { console.log(`RP ${scene}: no feed`); continue }
  try { buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }); console.log(`RP ${scene}: curbWidth ${f.curbWidth} — BUILT (no refusal)`) }
  catch (e) { console.log(`RP ${scene}: curbWidth ${f.curbWidth} — REFUSED: ${String(e.message).split('\n')[0].slice(0, 200)}`) }
}
