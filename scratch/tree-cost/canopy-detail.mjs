// Why hero canopies read smooth (Grain, 2026-10-05, Jacob: "too smooth … a shiny effect … needs a highpass for surface
// shadows"). Per species, the FRONT leaf shell (az0_leaf0) — what the eye sees — measured inside the crown (albedo
// alpha > the cards' 0.4 cutoff):
//   · AO pinned: share of crown pixels at AO ≥ 0.99 — the capture's clamp(shaded/albedo, 0, 1) flattens every lit leaf;
//   · fine shading: mean |AO − blur(AO)| at leaf-clump scale, in AO units (0..1), on the page as it ships (R of the
//     AO+depth PNG) and, where the pre-depth page is still on disk, the old ETC1S KTX2 (Q2);
//   · fine colour: the same high-pass on the albedo's luminance (linear), for scale.
// Metric: high-pass energy = mean absolute difference from a Gaussian blur (σ in metres → pixels per page).
//   node scratch/tree-cost/canopy-detail.mjs <town> [sigmaM=0.5]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { PNG } from 'pngjs'
import sharp from 'sharp'
const town = process.argv[2] || 'lafayette-square', sigmaM = Number(process.argv[3] || 0.5)
const base = `public/baked/${town}`, atlas = JSON.parse(fs.readFileSync(`${base}/trees-atlas.json`, 'utf8')).heroImpostorBySpecies
const placed = {}; for (const i of JSON.parse(fs.readFileSync(`${base}/trees.json`, 'utf8')).instances) placed[i.species] = (placed[i.species] || 0) + 1
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-cost-cd-'))
async function hp(gray, W, H, sigmaPx, mask) {   // gray: Float32 0..1, row-major
  const buf = Buffer.from(Uint8Array.from(gray, (v) => Math.max(0, Math.min(255, Math.round(v * 255)))))
  const bl = await sharp(buf, { raw: { width: W, height: H, channels: 1 } }).blur(Math.max(0.3, sigmaPx)).raw().toBuffer()
  let s = 0, n = 0
  for (let i = 0; i < W * H; i++) if (mask(i)) { s += Math.abs(gray[i] - bl[i] / 255); n++ }
  return n ? s / n : NaN
}
try {
  console.log(`${town} · front leaf shell az0 · σ ${sigmaM} m · inside the crown`)
  console.log('species          trees | AO pinned=1 | fine shading AO (new PNG / old KTX2) | fine colour (albedo L)')
  for (const sp of Object.keys(placed).sort((a, b) => placed[b] - placed[a])) {
    const rec = atlas?.[sp]; if (!rec) continue
    const dir = `${base}/trees/hero-impostor/${sp}`, f = 'az0_leaf0'
    if (!fs.existsSync(`${dir}/${f}.albedo.png`)) continue
    const al = PNG.sync.read(fs.readFileSync(`${dir}/${f}.albedo.png`)), ao = PNG.sync.read(fs.readFileSync(`${dir}/${f}.ao.png`))
    const span = 2 * (rec.depth?.halfM || rec.canopyRadiusM || 10)   // the frame's side, metres
    const aoW = ao.width, alW = al.width
    const inAl = (i) => al.data[i * 4 + 3] > 102
    const inAo = (j) => { const x = j % aoW, y = (j / aoW) | 0; return inAl(((y * al.height / ao.height) | 0) * alW + ((x * alW / aoW) | 0)) }
    const aoG = Float32Array.from({ length: aoW * ao.height }, (_, j) => ao.data[j * 4] / 255)
    let pinned = 0, n = 0; for (let j = 0; j < aoG.length; j++) if (inAo(j)) { n++; if (aoG[j] >= 0.99) pinned++ }
    const sAo = sigmaM * aoW / span, sAl = sigmaM * alW / span
    const hpNew = await hp(aoG, aoW, ao.height, sAo, inAo)
    let hpOld = NaN
    const k = `${dir}/${f}.ao.ktx2`
    if (fs.existsSync(k) && fs.statSync(k).mtimeMs < fs.statSync(`${dir}/${f}.ao.png`).mtimeMs) {
      const u = fs.mkdtempSync(path.join(tmp, sp)); execFileSync('basisu', ['-unpack', '-no_ktx', '-linear', path.resolve(k)], { cwd: u, stdio: 'ignore' })
      const pf = fs.readdirSync(u).find((x) => /_unpacked_rgb_BC7_RGBA.*\.png$/.test(x))
      if (pf) { const o = PNG.sync.read(fs.readFileSync(path.join(u, pf))); if (o.width === aoW) hpOld = await hp(Float32Array.from({ length: aoW * o.height }, (_, j) => o.data[j * 4] / 255), aoW, o.height, sAo, inAo) }
    }
    const L = Float32Array.from({ length: alW * al.height }, (_, i) => 0.2126 * lin(al.data[i * 4]) + 0.7152 * lin(al.data[i * 4 + 1]) + 0.0722 * lin(al.data[i * 4 + 2]))
    const hpCol = await hp(L, alW, al.height, sAl, inAl)
    const f3 = (v) => Number.isFinite(v) ? v.toFixed(3) : '  —  '
    console.log(`${sp.padEnd(16)} ${String(placed[sp]).padStart(5)} |    ${(100 * pinned / n).toFixed(0).padStart(3)}%    |        ${f3(hpNew)}  /  ${f3(hpOld)}            |   ${f3(hpCol)}`)
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }
