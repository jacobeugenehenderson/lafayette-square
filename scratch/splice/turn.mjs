// Splice probe: the turn (deflection, degrees) of a mint chain at named vertices, and the two segment lengths.
//   CARTOGRAPH_SCENE=<s> RIBP=<ribbons> node scratch/splice/turn.mjs --data=<root> skelId:idx …
import fs from 'fs'; import { join } from 'path'
const scene = process.env.CARTOGRAPH_SCENE, root = process.argv.find(a => a.startsWith('--data='))?.slice(7) || '.'
const { tessellateAdaptive } = await import('../../cartograph/derive.js')
const sk = JSON.parse(fs.readFileSync(join(root, 'cartograph/data', scene, 'clean/skeleton.json'), 'utf8'))
const simp = new Map((sk.streets || []).map(st => [st.id, tessellateAdaptive((st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments)]))
for (const a of process.argv.slice(2).filter(x => !x.startsWith('--'))) { const [id, s] = a.split(':'), i = +s, P = simp.get(id)
  if (!P || i <= 0 || i >= P.length - 1) { console.log(`${a}: end or missing (n=${P?.length})`); continue }
  const t = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) - Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])
  console.log(`${a}: turn ${(Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI).toFixed(1)}° · segs ${Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]).toFixed(3)} m / ${Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]).toFixed(3)} m`) }
