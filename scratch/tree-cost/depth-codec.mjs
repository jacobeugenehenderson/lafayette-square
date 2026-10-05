// Item 2 of BRIEF-hero-card-depth (Grain, 2026-10-04): the depth error a codec would add, in METRES, measured on a
// stand-in signal — the hero cards' REAL AO pages (single-channel, crown-shaped), since no depth capture exists yet.
// ⚠️ A real depth page steps harder between leaf clusters than AO does, so EDGE error here is a lower bound.
//   node scratch/tree-cost/depth-codec.mjs [town] [species…]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
const town = process.argv[2] || 'lafayette-square'
const atlas = JSON.parse(fs.readFileSync(`public/baked/${town}/trees-atlas.json`, 'utf8')).heroImpostorBySpecies
const species = process.argv.slice(3).length ? process.argv.slice(3) : ['oak_white', 'maple_red', 'birch', 'linden_american']
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-cost-depth-'))
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
const read = (f) => PNG.sync.read(fs.readFileSync(f))
try {
  console.log(`${town} — depth error in metres over each card's depth span 2R (stand-in: its az0 front-shell AO page)`)
  console.log('species          2R(m) | codec → device format        drawn px p50/p99/max   | edge p99/max (top 5% |grad| of drawn px)')
  for (const sp of species) {
    const rec = atlas[sp]; if (!rec) { console.log(`${sp}: no hero record`); continue }
    const span = 2 * rec.canopyRadiusM
    const src = path.join(`public/baked/${town}/trees/hero-impostor/${sp}`, 'az0_leaf0.ao.png')
    const o = read(src), W = o.width, H = o.height
    const orig = (i) => o.data[i * 4]
    // Only pixels the card DRAWS count: its albedo alpha above the cards' 0.4 cutoff (albedo is a larger page; sample it).
    const al = read(src.replace('.ao.png', '.albedo.png')), cutA = Math.round(0.4 * 255)
    const drawn = (i) => { const x = i % W, y = (i / W) | 0; return al.data[(((y * al.height / H) | 0) * al.width + ((x * al.width / W) | 0)) * 4 + 3] > cutA }
    // edge pixels: top 5% of local gradient in the original
    const g = new Float32Array(W * H)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; g[i] = Math.abs(orig(i + 1) - orig(i - 1)) + Math.abs(orig(i + W) - orig(i - W)) }
    const gd = []; for (let i = 0; i < W * H; i++) if (drawn(i)) gd.push(g[i]); gd.sort((a, b) => a - b); const gt = gd[Math.floor(0.95 * gd.length)]
    const run = (label, out) => {
      const d = read(out), all = [], edge = []
      for (let i = 0; i < W * H; i++) { if (!drawn(i)) continue; const e = Math.abs(d.data[i * 4] - orig(i)) / 255 * span; all.push(e); if (g[i] >= gt && gt > 0) edge.push(e) }
      all.sort((a, b) => a - b); edge.sort((a, b) => a - b)
      const f = (x) => x.toFixed(2).padStart(5)
      console.log(`${sp.padEnd(16)} ${span.toFixed(1).padStart(5)} | ${label.padEnd(28)} ${f(q(all, 0.5))} ${f(q(all, 0.99))} ${f(all[all.length - 1])}   | ${f(q(edge, 0.99))} ${f(edge[edge.length - 1])}`)
    }
    for (const [codec, flags] of [['ETC1S q255', ['-q', '255']], ['UASTC', ['-uastc']]]) {
      const k = path.join(tmp, `${sp}-${codec.replace(/\W/g, '')}.ktx2`)
      execFileSync('basisu', ['-ktx2', '-linear', ...flags, '-file', src, '-output_file', k], { stdio: 'ignore' })
      const u = path.join(tmp, `${sp}-${codec.replace(/\W/g, '')}`); fs.mkdirSync(u)
      execFileSync('basisu', ['-unpack', '-no_ktx', '-linear', k], { cwd: u, stdio: 'ignore' })
      const pick = (re) => path.join(u, fs.readdirSync(u).find((n) => re.test(n)))
      run(`${codec} → ASTC 4×4 (phones)`, pick(/_unpacked_rgb_ASTC_LDR_4X4_RGBA.*\.png$/))
      run(`${codec} → BC7 (desktop)`, pick(/_unpacked_rgb_BC7_RGBA.*\.png$/))
    }
    // 8-bit PNG: lossless on the 8-bit signal; its only error is the quantisation step itself.
    console.log(`${sp.padEnd(16)} ${span.toFixed(1).padStart(5)} | R8 PNG (lossless) — quantisation step ${(span / 255).toFixed(2)} m, error ≤ ${(span / 510).toFixed(2)} m · R16 PNG step ${(span / 65535 * 1000).toFixed(2)} mm`)
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }
