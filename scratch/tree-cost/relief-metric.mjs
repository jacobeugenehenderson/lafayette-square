// A/B metric for a --states run of shot.mjs (Grain, 2026-10-05): inside a canopy crop, the mean luminance and the
// leaf-scale contrast = mean |L − blur(L, σ px)|, plus each frame's mean |difference| from frame 0 (A–A = drift).
//   node scratch/tree-cost/relief-metric.mjs <prefix> <n> [x,y,w,h=260,600,900,300] [σ=2]
import sharp from 'sharp'
const [pre, n, box = '260,600,900,300', sg = '2'] = process.argv.slice(2), [left, top, width, height] = box.split(',').map(Number)
const L = async (f, blur) => { let p = sharp(f).extract({ left, top, width, height }).greyscale(); if (blur) p = p.blur(+sg); return p.raw().toBuffer() }
const f0 = await L(`${pre}-0.png`)
for (let i = 0; i < +n; i++) {
  const a = await L(`${pre}-${i}.png`), b = await L(`${pre}-${i}.png`, true)
  let m = 0, hp = 0, d = 0; for (let k = 0; k < a.length; k++) { m += a[k]; hp += Math.abs(a[k] - b[k]); d += Math.abs(a[k] - f0[k]) }
  console.log(`frame ${i}: mean L ${(m / a.length).toFixed(1)} · leaf-scale contrast ${(hp / a.length).toFixed(2)} · |Δ frame 0| ${(d / a.length).toFixed(2)}`)
}
