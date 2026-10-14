// prep.mjs — writes gate.sh's two scratch copies from the SOURCE, each edit asserted to match exactly once (so a moved
// line stops the gate instead of silently testing something else): bake-ground.gate.js (the main tree's bake-ground, which
// hashes everything buildTileBakeShape returns and exits) and tileGround.mutant.js (the branch's tileGround with each
// rings-only ring's first vertex moved 1 cm in x — the control that must read DIFFERS).   node prep.mjs
import { readFileSync, writeFileSync } from 'fs'
const W = new URL('./', import.meta.url).pathname, MAIN = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/'
const once = (src, a, b, what) => { if (src.split(a).length !== 2) throw new Error(`prep: ${what} — the anchor is not found exactly once; re-aim the copy`); return src.replace(a, b) }
const anchor = '  const { byMaterial, byFaceUse, shapeArtifact, highwayRings, blockRings, curbCutRamps, kerb } = buildTileBakeShape(ribbons, design, stencil.clipPolygon, surveyStreets, parkClip, scene, { proto: !!protoFlag })\n'
const hook = `  // ⚠️ RINGS-ONLY GATE COPY (written by prep.mjs): hash everything buildTileBakeShape returns, in order, exact doubles, then exit
  { const { createHash } = await import('node:crypto'), h = createHash('sha256'), parts = {}
    const ser = (v) => JSON.stringify(v, (k, x) => x instanceof Map ? [...x.entries()] : x instanceof Set ? [...x] : x)
    for (const [k, v] of Object.entries({ byMaterial, byFaceUse, shapeArtifact, highwayRings, blockRings, curbCutRamps, kerb })) {
      const s = ser(v) ?? 'undefined'; parts[k] = createHash('sha256').update(s).digest('hex').slice(0, 16); h.update(k + '\\0' + s + '\\0') }
    console.log(\`[rings-only-gate] \${scene} sha256 \${h.digest('hex')} · \${JSON.stringify(parts)} · shape \${((Date.now() - __gateT0) / 1000).toFixed(1)} s\`)
    process.exit(0) }
`
writeFileSync(W + 'bake-ground.gate.js', 'const __gateT0 = Date.now()\n' + once(readFileSync(MAIN + 'cartograph/bake-ground.js', 'utf8'), anchor, anchor + hook, 'bake-ground buildTileBakeShape call'))
writeFileSync(W + 'tileGround.mutant.js', once(readFileSync(W + '../../../src/lib/tileGround.js', 'utf8'),
  'if (g1.R.length >= 3) outR.push(g1.R); continue }', 'if (g1.R.length >= 3) outR.push([[g1.R[0][0] + 0.01, g1.R[0][1]], ...g1.R.slice(1)]); continue }', 'the rings-only push'))
console.log('[prep] bake-ground.gate.js + tileGround.mutant.js written')
