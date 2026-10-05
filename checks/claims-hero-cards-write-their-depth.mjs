// claims-hero-cards-write-their-depth.mjs — DO HERO CARDS CARRY A DEPTH PAGE FROM CAPTURE TO SHADER, SO CROWNS MEET AS VOLUMES?
//
// BRIEF-hero-card-depth (Jacob ruled B, then option 2, 2026-10-04): neighbouring hero cards are flat planes that slice
// each other ("chopping"). Each layer now carries an AO+DEPTH page (R = AO, G = depth toward the camera), and the card
// writes per-pixel depth from it. Holds:
//   ① the Grove's hero capture shoots a DEPTH pass into a LINEAR target with the same material (cutout, deformers), and
//     the tree material's capture mode writes depth after the colour-space encode;
//   ② the page: AO box-averaged, depth averaged over COVERED pixels only and dilated outward, alpha opaque (run here);
//   ③ it ships UNCOMPRESSED: the server writes it as PNG (no KTX2) and the pour's packer leaves it alone;
//   ④ the runtime uploads it as RG8 (never RGBA: ×2 memory) and the card writes gl_FragDepth on BOTH depth paths —
//     three's log formula (desktop) and the projection (phones' linear depth) — from the page's G;
//   ⑤ the hero capture format is ≥ 7, so every pre-depth record is dirty by construction;
//   ⑥ (report) per town, how many PLACED species carry depth pages — the re-bake is the operator's.
//
// ▶ MUTATION-TEST IT:
//     · impostorTexture.js: upload the RG page as THREE.RGBAFormat → ④ RED
//     · treeAtlasMaterial.js HERO_STAMP_FRAG: delete the linear-path gl_FragDepth line → ④ RED
//
//   node checks/claims-hero-cards-write-their-depth.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const has = (s, re, yes, no) => (re.test(s) ? ok(yes) : bad(no))

console.log('① the capture shoots depth')
{
  const c = src('src/components/captureImpostor.js'), t = src('src/components/treeAtlasMaterial.js')
  has(c, /depthTex = renderTreeToTexture\([^)]*captureDepth: true/, 'captureHeroBand shoots a depth pass', 'captureHeroBand shoots no depth pass')
  has(c, /colorSpace: opts\.captureDepth \? THREE\.NoColorSpace/, 'the depth pass renders into a linear target', 'the depth pass target is sRGB — the hardware would gamma-encode depth')
  has(t, /#include <dithering_fragment>\s*\n\s*if \(uCaptureDepth > 0\.5\) \{\s*\n\s*gl_FragColor = vec4\(vec3\(clamp\(\(uCaptureDepth - vViewPosition\.z\)/, 'the tree material writes depth LAST (after the colour-space encode)', 'the tree material\'s depth capture is missing or before the encode')
}

console.log('② the AO+depth page')
{
  const { composeAoDepthPage } = await import(pathToFileURL(path.join(REPO, 'src/components/heroDepthPage.js')))
  const S = 8, ao = new Uint8Array(S * S * 4), d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; ao[i] = 90; if (x < 4 && y < 4) { d[i] = 220; d[i + 3] = 255 } }
  const p = composeAoDepthPage({ data: ao, width: S, height: S }, { data: d, width: S, height: S }, 4)
  const at = (x, yTop, c) => p.data[(yTop * 4 + x) * 4 + c]
  // readback row 0 is the BOTTOM: the covered quadrant (x<4,y<4 in readback) lands bottom-left of the top-down page
  at(0, 3, 1) === 220 ? ok('covered depth is averaged over covered pixels only (220, not diluted by background)') : bad(`covered depth reads ${at(0, 3, 1)} ≠ 220`)
  at(3, 0, 1) === 220 ? ok('the background is filled by dilation (mipmaps never reach empty space)') : bad(`a background pixel reads ${at(3, 0, 1)} — not dilated`)
  at(0, 0, 0) === 90 && at(0, 0, 3) === 255 ? ok('AO passes through in R; alpha is opaque') : bad(`R ${at(0, 0, 0)} / A ${at(0, 0, 3)}`)
}

console.log('③ it ships uncompressed')
{
  const s = src('arborist/serve.js'), h = s.slice(s.indexOf('POST /hero-impostor/:look/:species'), s.indexOf('POST /hero-impostor/:look/:species') + 5000)
  has(h, /ao: l\.aoDepth \? writePng\('ao', l\.ao\)/, 'the server writes the AO+depth page as PNG', 'the server KTX2-encodes the AO+depth page — metres of depth error')
  has(h, /depth: body\.depth \?\? null/, 'the record carries the depth range', 'the record drops the depth range')
  has(src('arborist/pack-impostor-ktx2.mjs'), /if \(!l\.aoDepth\) yield \[l, 'ao'\]/, 'the pour\'s packer leaves the AO+depth page as PNG', 'the packer would re-encode the AO+depth page to KTX2')
}

console.log('④ the runtime uploads RG8 and writes depth on both paths')
{
  const l = src('src/components/impostorTexture.js')
  has(l, /channels === 'rg'[\s\S]{0,900}new THREE\.DataTexture\(new Uint8Array\(\[[^\]]*\]\), \d+, \d+, THREE\.RGFormat\b/, 'the page uploads as RG8', 'the page does not upload as RG8 (RGBA doubles its memory)')
  has(src('src/components/HeroImpostorTrees.jsx'), /channels: l\.aoDepth \? 'rg'/, 'hero cards request the RG upload for AO+depth pages', 'hero cards load the AO+depth page as an ordinary texture')
  const f = src('src/components/treeAtlasMaterial.js').match(/const HERO_STAMP_FRAG = `([\s\S]*?)`/)?.[1] || ''
  has(f, /texture2D\(uAO, vMapUv\)\.g/, 'the card reads depth from the page\'s G', 'the card does not read the page\'s depth')
  has(f, /USE_LOGDEPTHBUF[\s\S]{0,120}gl_FragDepth = log2\(1\.0 - hdViewZ\) \* logDepthBufFC \* 0\.5/, 'log-depth path (desktop): three\'s formula on the offset view z', 'the log-depth path does not write the card\'s depth')
  has(f, /#else\s*\n\s*gl_FragDepth = 0\.5 \* \(projectionMatrix\[2\]\[2\] \* hdViewZ/, 'linear path (phones): the projection of the offset view z', 'the linear (phone) path does not write the card\'s depth')
  has(f, /uHeroDepthHalfM > 0\.0 \? \(hdTree - vHeroCardZ\)[^:]*: 0\.0/, 'a page without depth sits exactly on the card\'s plane', 'a page without depth would be read as depth')
}

console.log('⑤ the capture format')
{
  const v = +(src('src/arborist/captureKey.js').match(/CAPTURE_FORMAT = \{[^}]*hero: (\d+)/)?.[1] || 0)
  v >= 7 ? ok(`hero capture format ${v} — every pre-depth record is dirty`) : bad(`hero capture format ${v} < 7 — pre-depth records read as current`)
}

console.log('⑥ placed species with depth pages (report; the Grove re-bake is the operator\'s)')
for (const town of fs.readdirSync(path.join(REPO, 'public/baked'))) {
  const a = path.join(REPO, 'public/baked', town, 'trees-atlas.json'), t = path.join(REPO, 'public/baked', town, 'trees.json')
  if (!fs.existsSync(a) || !fs.existsSync(t)) continue
  const he = JSON.parse(fs.readFileSync(a, 'utf8')).heroImpostorBySpecies || {}
  const placed = [...new Set(JSON.parse(fs.readFileSync(t, 'utf8')).instances.map((i) => i.species))].filter((s) => he[s])
  if (!placed.length) continue
  const withDepth = placed.filter((s) => he[s].depth?.halfM && (he[s].layers || []).every((l) => l.aoDepth))
  console.log(`   ${withDepth.length === placed.length ? '✅' : '⚠️ '} ${town}: ${withDepth.length}/${placed.length} placed species carry depth pages`)
}

console.log(red ? `\n⛔ ${red} claim(s) RED` : '\n✅ hero cards carry a depth page from capture to shader')
process.exit(red ? 1 : 0)
