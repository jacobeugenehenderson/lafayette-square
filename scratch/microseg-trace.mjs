// Trace where each short segment's endpoints come from: compare the
// post-derive ribbon chain points against the raw skeleton chain points.
import fs from 'fs'
import { RAW_DIR, CLEAN_DIR } from '../cartograph/config.js'
import { snapAll } from '../cartograph/snap.js'
import { deriveLayers } from '../cartograph/derive.js'

const raw = JSON.parse(fs.readFileSync(RAW_DIR + '/osm.json', 'utf8'))
const snapped = snapAll(raw)
const layers = deriveLayers(snapped.ground.highway || [])
const streets = layers.ribbons.streets

const skel = JSON.parse(fs.readFileSync(CLEAN_DIR + '/skeleton.json', 'utf8'))
const skelById = new Map()
for (const s of (skel.streets || [])) skelById.set(s.id || s.skelId, s)

const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

for (const st of streets) {
  const p = st.points
  const ixIdx = new Set((st.intersections || []).map(x => x.ix))
  for (let i = 0; i < p.length - 1; i++) {
    if (D(p[i], p[i + 1]) < 2.0) {
      // does this short seg exist in the skeleton chain (pre-splice)?
      const sk = skelById.get(st.skelId)
      let inSkel = false
      if (sk) {
        const sp = (sk.points || sk.pts || []).map(q => Array.isArray(q) ? q : [q.x, q.z])
        for (let j = 0; j < sp.length - 1; j++) {
          if (D(sp[j], p[i]) < 0.05 && D(sp[j + 1], p[i + 1]) < 0.05) { inSkel = true; break }
        }
      }
      console.log(`${st.skelId} i=${i} len=${D(p[i], p[i + 1]).toFixed(3)} aIx=${ixIdx.has(i)} bIx=${ixIdx.has(i + 1)} inSkelChain=${inSkel} skelPts=${sk ? (sk.points || sk.pts || []).length : 'NO-SKEL'}`)
    }
  }
}
