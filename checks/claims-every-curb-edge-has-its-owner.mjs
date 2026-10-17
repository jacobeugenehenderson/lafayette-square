#!/usr/bin/env node
// claims-every-curb-edge-has-its-owner.mjs — EVERY ② EDGE CARRIES THE ① OWNER IT WAS STRUCK FROM.
//
// ② is ① minus each edge's depth band (`offsetRingByRects`); each ② edge takes the contributor it lies on (`labelOf`)
// and so the ① edge, and through it the street (skelId · side · segOrd). An edge that takes none carries no run and no
// cap, so the ground reads no height there and the deformer refuses the bake. Reads the producer's own walk, where the
// label is consumed (`protoUnlabelled`, tileGround.js), built through the one feed with the town's authoring loaded.
// Counted on the tiles ① keeps (the circle drops blocks the walk also read). Each unowned edge is printed with its site.
//   node checks/claims-every-curb-edge-has-its-owner.mjs [--scene=<town> …]   (no town ⇒ every town with ribbons)
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'

const SHOW = 4
let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, protoArtifact: true }) }
  catch (e) { console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  finally { console.warn = warn }
  const U = R.protoUnlabelled
  if (!U) { console.log(`⛔ ${scene}: the producer reported no edge census — ① did not produce this town's tiles, nothing was checked`); bad++; continue }
  towns++
  const kept = new Set(R.protoShapeTiles.flatMap(t => (t.iaFull || []).flat().map(v => v.join(',')))), at = U.at.filter(a => kept.has(a.p.join(',')))
  if (at.length || U.noOwner) { bad++
    console.log(`⛔ ${scene}: ${at.length} of ${kept.size} ② edges on its tiles took no ① owner (${U.edges} in every block the walk read)${U.noOwner ? ` · ${U.noOwner} name an owner ① does not have` : ''}`)
    for (const a of at.slice(0, SHOW)) console.log(`     block ${a.block} ring ${a.ring}: (${a.p.map(c => c.toFixed(3)).join(', ')}) → (${a.q.map(c => c.toFixed(3)).join(', ')}) · ${(Math.hypot(a.q[0] - a.p[0], a.q[1] - a.p[1]) * 1000).toFixed(2)} mm`)
  } else console.log(`✅ ${scene}: all ${kept.size} ② edges on its tiles carry their ① owner`)
}
if (!towns) { console.log('⛔ no town produced ① tiles — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — a ② edge has no owner, so the ground cannot say whose curb it is' : '✅ GREEN — every ② edge carries its ① owner'}`)
process.exit(bad ? 1 : 0)
