// Splice probe: the mint's own chains (tessellated skeleton, as remint.mjs builds them) at named skelIds — ends, caps, degree.
//   CARTOGRAPH_SCENE=<s> RIBP=<ribbons> node scratch/splice/ends.mjs --data=<root> id…
import fs from 'fs'; import { join } from 'path'
const scene = process.env.CARTOGRAPH_SCENE, root = process.argv.find(a => a.startsWith('--data='))?.slice(7) || '.'
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'))
const { tessellateAdaptive } = await import('../../cartograph/derive.js')
const rb = JSON.parse(fs.readFileSync(process.env.RIBP, 'utf8')), sk = JSON.parse(fs.readFileSync(join(root, 'cartograph/data', scene, 'clean/skeleton.json'), 'utf8'))
const simp = new Map((sk.streets || []).map(st => [st.id, tessellateAdaptive((st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments)]))
for (const s of rb.streets.filter(s => ids.includes(s.skelId ?? s.name))) {
  const p = simp.get(s.skelId ?? s.name), f = (q) => `(${q[0].toFixed(4)}, ${q[1].toFixed(4)})`
  console.log(`${s.skelId} gs=${!!s.gradeSeparated} n=${p.length} start ${f(p[0])} deg ${s.caps?.start?.degree} · end ${f(p[p.length - 1])} deg ${s.caps?.end?.degree} · ribbons ends ${f(s.points[0])} ${f(s.points[s.points.length - 1])}`)
  console.log(`   first 3: ${p.slice(0, 3).map(f).join(' ')}  last 3: ${p.slice(-3).map(f).join(' ')}`)
}
