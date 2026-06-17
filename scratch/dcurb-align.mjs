import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const get=n=>ribbons.streets.find(s=>s.skelId===n)
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], len=v=>Math.hypot(v[0],v[1])
// At the WEST transition (mark#3): spine=lafayette-3 (extends EAST from node), carriageways 7/8 (extend WEST)
const spine=get('lafayette-avenue-3')
const node=spine.points[0]   // [-354.8,138.9]
// spine direction (into spine, eastward): node -> points[1]
const sdir=sub(spine.points[1],node); const sl=len(sdir); const su=[sdir[0]/sl,sdir[1]/sl]
// perpendicular (left normal)
const sn=[-su[1],su[0]]
console.log(`node=[${node[0].toFixed(1)},${node[1].toFixed(1)}] spine dir(E)=[${su[0].toFixed(3)},${su[1].toFixed(3)}] hw L=10.56 R=7.90`)
console.log(`spine outer curb offsets: +n(left)=${(10.555).toFixed(2)}m  -n(right)=${(7.90).toFixed(2)}m  (carriageway hw=4.67)`)
for(const cn of ['lafayette-avenue-7','lafayette-avenue-8']){
  const c=get(cn)
  // carriageway point nearest node
  let near=c.points[0], best=1e9
  for(const p of c.points){const d=len(sub(p,node)); if(d<best){best=d;near=p}}
  // lateral offset of carriageway centerline from spine line (signed, along sn)
  const rel=sub(near,node)
  const lateral= rel[0]*sn[0]+rel[1]*sn[1]
  const along= rel[0]*su[0]+rel[1]*su[1]
  // carriageway outer edge = centerline +/- 4.67 along its own normal; approx using lateral
  console.log(`  ${cn}: nearest pt [${near[0].toFixed(1)},${near[1].toFixed(1)}] lateral(from spine,+left)=${lateral.toFixed(2)}m along=${along.toFixed(2)}m`)
  console.log(`     => if this is the LEFT carriageway, its outer curb sits at lateral+4.67=${(lateral+4.67).toFixed(2)} vs spine-left-outer +10.56`)
  console.log(`     => if RIGHT carriageway, outer curb at lateral-4.67=${(lateral-4.67).toFixed(2)} vs spine-right-outer -7.90`)
}
