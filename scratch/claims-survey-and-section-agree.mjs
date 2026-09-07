// ⛔ SURVEY AND SECTION MUST BE THE SAME THING. Survey draws `buildTileGround`'s live layers;
// Section opens `_shapeArtifact` through `sectionOpen`. Under ① both must come from ①②③ and
// agree geometrically — if they disagree, two constructions are on screen at once.
// ▶ node scratch/claims-survey-and-section-agree.mjs [scene ...]
import { feed } from './_proto-feed.mjs'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'

const sa = r => { let a=0; for (let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1} return a/2 }
const net = rs => Math.abs((rs||[]).reduce((s,r)=>s+sa(r),0))
const cmp = (tag,a,b) => {
  const A=net(a), B=net(b), d=Math.abs(A-B), rel=A?100*d/A:0
  console.log(`  ${tag.padEnd(9)} Survey ${A.toFixed(0).padStart(9)} m²  ·  Section ${B.toFixed(0).padStart(9)} m²  ·  Δ ${d.toFixed(0)} m² (${rel.toFixed(2)}%)  ${rel<0.5?'✅':'❌'}`)
  return rel < 0.5
}
for (const scene of (process.argv.slice(2).length?process.argv.slice(2):['lafayette-square'])) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const bR = f.ribbons.protopolygon?.boundaryRing || null
  const p=console.log; console.log=()=>{}
  const tg = buildTileGround(f.ribbons, { smooth:0, curbWidth:f.curbWidth, blockCustoms:f.blockCustoms,
    stencil: bR, emitArtifact:true, grout:'proto', protoProducer:true, protoArtifact:true })
  const S = sectionOpen(tg._shapeArtifact, f.curbWidth, { outer:'LU', inner:'SW' }, bR, f.blockCustoms)
  console.log=p
  console.log(`${scene}: ${tg._shapeArtifact.length} tile(s) in the artifact`)
  const prod = {}; for (const t of tg._shapeArtifact) prod[t.producer||'unstamped']=(prod[t.producer||'unstamped']||0)+1
  const withBands = tg._shapeArtifact.filter(t=>t.bands).length
  console.log(`  producers ${JSON.stringify(prod)} · carrying bands ${withBands}/${tg._shapeArtifact.length}`)
  let ok = true
  ok = cmp('asphalt', tg.asphalt, S.asphalt) && ok
  ok = cmp('curb',    tg.curb,    S.curb)    && ok
  ok = cmp('sidewalk',tg.sidewalk,S.sidewalk)&& ok
  ok = cmp('block',   tg.block,   S.block)   && ok
  const ka = Object.keys(tg.luByClass).sort().join(','), kb = Object.keys(S.luByClass).sort().join(',')
  console.log(`  LU classes ${ka===kb?'✅ identical':'❌ DIFFER'}\n    Survey : ${ka}\n    Section: ${kb}`)
  console.log(ok && ka===kb ? '  ✅ Survey and Section are the same thing.' : '  ❌ NOT the same thing.')
}
