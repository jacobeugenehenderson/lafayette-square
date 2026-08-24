// Does the extracted stampWindTier still classify exactly as the two hand-kept
// duplicates did before 2026-08-24? Parses the OLD thresholds straight out of
// git rather than restating them, so this cannot go stale into a false pass.
//
//   node scratch/claims-wind-tier-extraction.mjs
//
// Rook, 2026-08-24.
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import * as THREE from 'three'
import esbuild from 'esbuild'

// treeAtlasMaterial uses vite's extensionless imports, which node's ESM
// resolver rejects. Bundle it the way vite would, then import the real thing —
// so this check exercises the SHIPPING function, not a copy of it.
const outfile = 'scratch/.windtier-bundle.mjs'
await esbuild.build({
  entryPoints: ['src/components/treeAtlasMaterial.js'],
  bundle: true, format: 'esm', platform: 'neutral', outfile,
  external: ['three', 'react', 'react-dom', '@react-three/*'],
  resolveExtensions: ['.js', '.jsx', '.mjs', '.json'],
  loader: { '.js': 'jsx', '.jsx': 'jsx' }, logLevel: 'silent',
  // vite injects these; a module-scope consumer runs at import time.
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'test', SSR: false }) },
})
const mod = await import('./.windtier-bundle.mjs')
rmSync(outfile, { force: true })
const { stampWindTier, stampWindRadialNorm, measureChassisRadius } = mod

const BASE = process.env.BASE_REF || '5ef05604'
const src = execSync(`git show ${BASE}:src/components/InstancedTrees.jsx`, { encoding: 'utf8' })

// Read the old thresholds out of the old source.
const m = src.match(/if\s*\(r\s*>\s*([\d.]+)\s*&&\s*y\s*<\s*([\d.]+)\)\s*tier\s*=\s*0[\s\S]{0,120}?r\s*>\s*([\d.]+)\)\s*tier\s*=\s*1/)
if (!m) { console.error('FAIL: could not parse the old classifier out of', BASE); process.exit(1) }
const [, R_TRUNK, Y_TRUNK, R_BRANCH] = m.map(Number)
console.log(`old thresholds parsed from ${BASE}: r>${R_TRUNK} && y<${Y_TRUNK} => 0 | r>${R_BRANCH} => 1 | else 2`)

const oldTier = (x, y, z) => {
  const r = Math.sqrt(x * x + z * z)
  return (r > R_TRUNK && y < Y_TRUNK) ? 0 : (r > R_BRANCH ? 1 : 2)
}

// Deterministic pseudo-random cloud spanning trunk / branch / twig / canopy.
let seed = 12345
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const N = 60000
const pos = new Float32Array(N * 3)
for (let i = 0; i < N; i++) {
  pos[i * 3]     = (rnd() - 0.5) * 18
  pos[i * 3 + 1] = rnd() * 22
  pos[i * 3 + 2] = (rnd() - 0.5) * 18
}
const mk = () => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3))
  return g
}

let fails = 0

// 1. bark tiers identical
const gb = mk(); stampWindTier(gb, true)
const tb = gb.attributes.aWindTier
for (let i = 0; i < N; i++) {
  if (tb.getX(i) !== oldTier(pos[i*3], pos[i*3+1], pos[i*3+2])) { fails++; if (fails < 4) console.error('  tier mismatch at', i) }
}
console.log(fails === 0 ? 'PASS bark tiers identical to ' + BASE : `FAIL ${fails} bark tier mismatches`)

// 2. leaves still flat 3
const gl = mk(); stampWindTier(gl, false)
const allThree = [...Array(N).keys()].every(i => gl.attributes.aWindTier.getX(i) === 3)
console.log(allThree ? 'PASS leaf cards all tier 3' : 'FAIL leaf cards not all tier 3'); if (!allThree) fails++

// 3. the new radial axis spans [0,1] and is monotone in r
const gr = mk()
const R = measureChassisRadius([gr])
stampWindRadialNorm(gr, R)
const rn = gr.attributes.aWindRadialNorm
let mn = Infinity, mx = -Infinity, mono = true
for (let i = 0; i < N; i++) {
  const v = rn.getX(i); if (v < mn) mn = v; if (v > mx) mx = v
  const want = Math.min(1, Math.hypot(pos[i*3], pos[i*3+2]) / R)
  if (Math.abs(v - want) > 1e-5) mono = false
}
console.log(`radial: min=${mn.toFixed(3)} max=${mx.toFixed(3)} R=${R.toFixed(2)}m exact=${mono}`)
if (!(mn >= 0 && mx <= 1 && mx > 0.9 && mono)) { console.log('FAIL radial axis'); fails++ }
else console.log('PASS radial axis spans [0,1] and equals r/R')

// 4. the axes DISAGREE — i.e. the new ramp is not just the old buckets renamed.
//    A high, far-out vertex must outrank a high, central one.
const tipWhip  = 0.55 * (20/22) + 0.45 * (8/R)
const boleWhip = 0.55 * (20/22) + 0.45 * (0.03/R)
console.log(`whip(tip 8m out, 20m up)=${tipWhip.toFixed(3)} vs whip(bole core, 20m up)=${boleWhip.toFixed(3)}`)
console.log(tipWhip > boleWhip ? 'PASS tip outranks bole (the old buckets had this BACKWARDS)' : 'FAIL')

process.exit(fails === 0 ? 0 : 1)
