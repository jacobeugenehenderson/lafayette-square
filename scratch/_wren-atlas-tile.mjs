// Does a species' bark tile in the baked master atlas actually carry detail?
// Usage: node scratch/_wren-atlas-tile.mjs <look> <species>
import sharp from 'sharp'
const [look = 'lafayette-square', sp = 'linden_american'] = process.argv.slice(2)
const j = JSON.parse(await (await import('fs/promises')).readFile(`public/baked/${look}/trees-atlas.json`, 'utf8'))
const t = j.barkDetailBySpecies?.[sp]?.barkTileUV
if (!t) { console.log(`no bark tile recorded for ${sp}`); process.exit(1) }
const src = `public/baked/${look}/trees-atlas-color.png`
const { width: W, height: H } = await sharp(src).metadata()
const box = { left: Math.round(t.offsetU*W), top: Math.round(t.offsetV*H),
              width: Math.round(t.scaleU*W), height: Math.round(t.scaleV*H) }
const buf = await sharp(src).extract(box).raw().toBuffer()
const n = box.width * box.height
let m = 0; for (let i=0;i<n;i++) m += 0.299*buf[i*3]+0.587*buf[i*3+1]+0.114*buf[i*3+2]; m/=n
let v = 0; for (let i=0;i<n;i++){ const l=0.299*buf[i*3]+0.587*buf[i*3+1]+0.114*buf[i*3+2]; v+=(l-m)**2 } v=Math.sqrt(v/n)
console.log(`${sp} bark tile ${box.width}x${box.height} @ ${box.left},${box.top} | luminance mean ${m.toFixed(1)} sigma ${v.toFixed(2)}`)
console.log(v < 3 ? '⛔ FLAT — no bark detail in the atlas' : '✅ tile carries real detail — any flatness on screen is SAMPLING, not the bake')
