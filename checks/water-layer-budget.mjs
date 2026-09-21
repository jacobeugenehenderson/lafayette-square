// water-layer-budget.mjs — WHICH LAYER IS ACTUALLY CARRYING THE PICTURE?
//
// ⭐⭐ NOT A PASS/FAIL CHECK — A HARNESS, and it is here because it found in ONE
// RUN what four rounds of screenshots could not (2026-09-20). Evaluate the water
// shader's own maths in Node — same octaves, same Cox & Munk scale, same Fresnel,
// same clip — and print what each LAYER contributes at a given camera pitch, so a
// dead layer shows up as a NUMBER instead of as an argument about a screenshot.
//
// ⛔ THE LESSON IT ENCODES. Every wrong turn that evening came from reasoning
// about shader terms without measuring their MAGNITUDES. The decisive fact was one
// line of arithmetic: at a 55° overhead pitch Fresnel is 0.0202, so every
// reflection layer contributes ~2% and THE BODY IS 98% OF THE OUTPUT. Four rounds
// of tuning reflections could not have moved that picture, and no screenshot was
// ever going to say so.
// ⭐ ⇒ Before tuning a water layer, RUN THIS and check the layer you are about to
// change is one the camera can actually see. Numbers first; the still is the last
// step, not the first.
//
//   node checks/water-layer-budget.mjs
// Read-only, no browser, always exits 0 — it reports, it does not judge.
import { GLITTER_OCTAVES, phaseSpeed, coxMunkSlopeVariance, slopeScaleForWind,
         maxRoughnessForWind, WIND_FLOOR_MPS } from '../src/components/waterMaterial.js'

const fract = x => x - Math.floor(x)
const hash = (x,z) => fract(Math.sin(x*127.1 + z*311.7) * 43758.5453)
const sm = f => f*f*(3-2*f)
const noise = (x,z) => { const ix=Math.floor(x), iz=Math.floor(z)
  const fx=sm(x-ix), fz=sm(z-iz)
  const a=hash(ix,iz), b=hash(ix+1,iz), c=hash(ix,iz+1), d=hash(ix+1,iz+1)
  const lo=a+(b-a)*fx, hi=c+(d-c)*fx; return lo+(hi-lo)*fz }
const slopeAt = (px,pz,scale) => { let sx=0,sz=0
  for (const o of GLITTER_OCTAVES) { const qx=px/o.lambdaM, qz=pz/o.lambdaM
    sx += (noise(qx+0.5,qz)-noise(qx-0.5,qz))*o.steep
    sz += (noise(qx,qz+0.5)-noise(qx,qz-0.5))*o.steep }
  return [sx*scale, sz*scale] }
const norm = v => { const L=Math.hypot(...v); return v.map(c=>c/L) }
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const fresnel = (N,V) => { const c=Math.max(0,Math.min(1,1-Math.max(0,dot(N,V)))); const c2=c*c; return 0.02+0.98*(c2*c2*c) }

// The case in Jacob's screenshot: high overhead camera looking down at the lake.
const cases = [
  { name: 'overhead   (Stage hero pitch)', viewPitchDeg: 55, wind: 0 },
  { name: 'overhead   windy (8 m/s)',     viewPitchDeg: 55, wind: 8 },
  { name: 'grazing    (eye level at the shore)', viewPitchDeg: 6, wind: 0 },
]
const FLECK_LO = 1.5, FLECK_HI = 2.6, FLECK_GAIN = 2.2, SKY_BASE = 0.9

for (const c of cases) {
  const wind = Math.max(WIND_FLOOR_MPS, c.wind)
  const scale = slopeScaleForWind(wind)
  const rms = Math.sqrt(coxMunkSlopeVariance(wind))
  const p = c.viewPitchDeg * Math.PI/180
  const V = norm([0, Math.sin(p), Math.cos(p)])          // surface -> eye
  const flatN = [0,1,0]
  const Fflat = fresnel(flatN, V)
  let fleckSum=0, fleckHits=0, Ffacet=0, N=20000
  for (let i=0;i<N;i++){
    const [sx,sz] = slopeAt((i*7.31)%3000, (i*13.77)%3000, scale)
    const n = norm([-sx, 1, -sz])
    const mag = Math.hypot(sx,sz)/Math.max(rms,1e-4)
    const f = Math.max(0, Math.min(1, (mag-FLECK_LO)/(FLECK_HI-FLECK_LO)))
    const fs = f*f*(3-2*f)
    if (fs>0.5) fleckHits++
    fleckSum += fs
    Ffacet += fresnel(n, V)
  }
  Ffacet/=N
  const duty = 100*fleckHits/N
  console.log(`\n${c.name}   wind ${wind} m/s`)
  console.log(`  view pitch ${c.viewPitchDeg}°  ·  RMS slope ${(Math.atan(rms)*180/Math.PI).toFixed(1)}°`)
  console.log(`  FRESNEL  flat ${Fflat.toFixed(4)}   mean-facet ${Ffacet.toFixed(4)}`)
  console.log(`  WASH     x ${(Fflat*SKY_BASE).toFixed(4)}  of sky`)
  console.log(`  FLECKS   duty ${duty.toFixed(1)}%  ·  mean weight ${(fleckSum/N).toFixed(4)}`)
  console.log(`           as shipped (x flat F): ${(fleckSum/N*Fflat*FLECK_GAIN).toFixed(4)} of sky`)
  console.log(`           if facet F were used : ${(fleckSum/N*Ffacet*FLECK_GAIN).toFixed(4)} of sky`)
  console.log(`  BODY     x ${(1-Fflat).toFixed(3)} of its own colour`)
}

// ── THE BODY'S OWN TEXTURE — the thing that was lost, and the only thing
// visible from overhead where Fresnel is 2%.
console.log('\n══ BODY CREST SHADING (visible at ANY angle, unlike the reflection) ══')
for (const wind of [WIND_FLOOR_MPS, 8]) {
  const scale = slopeScaleForWind(wind), rms = Math.sqrt(coxMunkSlopeVariance(wind))
  let lo = 1, hi = 0, sum = 0, N = 20000
  for (let i = 0; i < N; i++) {
    const [sx, sz] = slopeAt((i*7.31)%3000, (i*13.77)%3000, scale)
    const t = Math.max(0, Math.min(1, (Math.hypot(sx,sz)/Math.max(rms,1e-4) - 0.6) / 1.2))
    const c = t*t*(3-2*t)
    lo = Math.min(lo,c); hi = Math.max(hi,c); sum += c
  }
  const mix = 0.42
  console.log(`  wind ${wind} m/s → crest term ${lo.toFixed(2)}..${hi.toFixed(2)} (mean ${(sum/N).toFixed(2)})`)
  console.log(`     body mixes ${(lo*mix*100).toFixed(0)}%..${(hi*mix*100).toFixed(0)}% toward the crest colour — that IS the wave texture`)
}
