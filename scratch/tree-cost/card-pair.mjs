// The card as the flat relight paints it at its face: albedo × (0.5 + 0.5·AO), beside the old KTX2 AO version.
import fs from 'node:fs'; import { PNG } from 'pngjs'; import sharp from 'sharp'; import { execFileSync } from 'node:child_process'
const [sp, out] = process.argv.slice(2), dir = `public/baked/lafayette-square/trees/hero-impostor/${sp}`
const al = PNG.sync.read(fs.readFileSync(`${dir}/az0_leaf0.albedo.png`)), W = al.width, H = al.height
const aoUp = async (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 4 } }).resize(W, H, { kernel: 'cubic' }).raw().toBuffer()
const nw = PNG.sync.read(fs.readFileSync(`${dir}/az0_leaf0.ao.png`))
const tmp = fs.mkdtempSync(process.env.TMPDIR + 'cp-'); execFileSync('basisu', ['-unpack', '-no_ktx', '-linear', fs.realpathSync(`${dir}/az0_leaf0.ao.ktx2`)], { cwd: tmp, stdio: 'ignore' })
const old = PNG.sync.read(fs.readFileSync(`${tmp}/${fs.readdirSync(tmp).find((x) => /_unpacked_rgb_BC7_RGBA.*\.png$/.test(x))}`))
const paint = (ao) => { const o = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { const a = al.data[i * 4 + 3] > 102, k = 0.5 + 0.5 * ao[i * 4] / 255
  for (let c = 0; c < 3; c++) o[i * 3 + c] = a ? Math.min(255, al.data[i * 4 + c] * k) : 235 } return o }
const A = paint(await aoUp(nw.data, nw.width, nw.height)), B = paint(await aoUp(old.data, old.width, old.height))
await sharp({ create: { width: W * 2 + 16, height: H, channels: 3, background: '#fff' } }).composite([{ input: A, raw: { width: W, height: H, channels: 3 }, left: 0, top: 0 }, { input: B, raw: { width: W, height: H, channels: 3 }, left: W + 16, top: 0 }]).png().toBuffer().then((b) => sharp(b).resize(1200).toFile(out))
fs.rmSync(tmp, { recursive: true })
