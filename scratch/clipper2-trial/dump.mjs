// dump.mjs <scene> — the HEAVY half of the Clipper2 trials: build ①② once through the probe copy, with authoring loaded
// (scratch/_proto-feed.mjs's `feed`, the one way a probe reads a scene), and write each block's ② INPUT exactly as the
// offset was handed it: the working ring (taper / flare split), the depth each edge was offset by (recorded as asked),
// the working copy's identity map, the ① labels, and the owner table. Run from the repo root.
//   node --max-old-space-size=<MB> scratch/clipper2-trial/dump.mjs hipointedemun
import { writeFileSync } from 'fs'
import { feed } from '../_proto-feed.mjs'
import { buildTileGround } from './tileGround.probe.mjs'
const scene = process.argv[2]
const f = feed(scene); if (!f) process.exit(2)
const t0 = Date.now(), prev = console.log; console.log = () => {}
let tg; try {
  tg = buildTileGround(f.ribbons, { grout: 'proto', protoProducer: true, smooth: 0, curbWidth: f.curbWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
} finally { console.log = prev }
const rec = (r) => ({ ring: r.WC.ring, depth: r.depth, e: r.WC.e, v: r.WC.v, hwy: r.WC.hwy, own: r.WC.own, labs: r.labs })
const blocks = Object.entries(tg.protoDepthByBlock || {}).map(([k, r]) => ({ k: +k, ...rec(r), holes: (r.holes || []).map(rec) }))
const owners = tg.protoOwners
const out = { scene, look: f.look, slots: f.slots, curbWidth: f.curbWidth, blocks, owners }
writeFileSync(new URL(`./in-${scene}.json`, import.meta.url), JSON.stringify(out))
console.log(`${scene}: ${blocks.length} blocks (${blocks.reduce((n, b) => n + b.holes.length, 0)} holes), authored slots ${f.slots}, ${((Date.now() - t0) / 1000).toFixed(0)} s, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`)
