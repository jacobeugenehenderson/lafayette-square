// make-rat.mjs <ucap copy> <out .js> — at every ① block-ring vertex within RAT_R m of a RAT_SITES point ([[x,z,name],…]) that
// turns ≥ 5°: its owners either side, its turn, protoRAt's R and branch (by the counters it bumps, restored after), and the
// frozen chain-pair node for the two owners (protoPairNode), with the ① vertex coordinate.
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const a = "        const rSrc = ring.map((_, i) => (touchesH"
if (s.split(a).length !== 2) throw new Error('anchor')
s = s.replace(a, `        { const _S = JSON.parse(process.env.RAT_SITES || '[]'), _R = +(process.env.RAT_R || 12)
          for (let i = 0; i < ring.length; i++) { const site = _S.find(t => Math.hypot(ring[i][0] - t[0], ring[i][1] - t[1]) < _R); if (!site) continue
            const tv = turnOf(ring, i); if (!(tv >= 5)) continue
            const snap = () => JSON.stringify([protoRZero, protoTipRound, protoTipBlunt, protoCornerN, protoCornerNoNode, protoCornerBend])
            const z0 = JSON.parse(snap()); const hwy = touchesH && (isHwyLab(labs[i]) || isHwyLab(labs[(i - 1 + ring.length) % ring.length]))
            const R = hwy ? 0 : protoRAt(labs, i, ring.length, depthAt(i), tv), z1 = JSON.parse(snap())
            const why = []; for (const kk of Object.keys(z0[0])) if (z1[0][kk] !== z0[0][kk]) why.push(kk)
            ;['tipRound', 'tipBlunt', 'corner', 'noNode', 'bend'].forEach((kk, j) => { if (z1[j + 1] !== z0[j + 1]) why.push(kk) })
            Object.assign(protoRZero, z0[0]); protoTipRound = z0[1]; protoTipBlunt = z0[2]; protoCornerN = z0[3]; protoCornerNoNode = z0[4]; protoCornerBend = z0[5]
            const oa = protoOwners[labs[(i - 1 + ring.length) % ring.length]], ob = protoOwners[labs[i]]
            const pk = oa && ob ? (oa.skelId < ob.skelId ? oa.skelId + '|' + ob.skelId : ob.skelId + '|' + oa.skelId) : null
            ;(globalThis.__rat ||= []).push({ site: site[2], block: k, v: i, at: ring[i], turn: +tv.toFixed(2), R, why: hwy ? ['highway'] : why,
              a: oa && \`\${oa.skelId}|\${oa.side}|\${oa.segOrd}\`, b: ob && \`\${ob.skelId}|\${ob.side}|\${ob.segOrd}\`, node: pk ? (protoPairNode[pk] ?? null) : null,
              legIn: Math.hypot(ring[i][0] - ring[(i - 1 + ring.length) % ring.length][0], ring[i][1] - ring[(i - 1 + ring.length) % ring.length][1]), legOut: Math.hypot(ring[(i + 1) % ring.length][0] - ring[i][0], ring[(i + 1) % ring.length][1] - ring[i][1]) }) } }
` + a)
s = s.replace("offNull: globalThis.__offNull || []", "offNull: globalThis.__offNull || [], rat: globalThis.__rat || []")
writeFileSync(out, s); console.log('site copy written:', out)
