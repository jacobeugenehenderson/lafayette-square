// Re-window an SVG whose viewBox is already in WORLD units (draw-one-block's is).
// usage: node scratch/_fx-crop-svg.mjs <in.svg> <cx> <cz> <span m> <out.svg>
import fs from 'fs'
const [inp, cx, cz, span, out] = process.argv.slice(2)
const s = +span, X = +cx - s / 2, Y = +cz - s / 2
const svg = fs.readFileSync(inp, 'utf8')
  .replace(/viewBox="[^"]*"/, `viewBox="${X} ${Y} ${s} ${s}"`)
  .replace(/width="\d+" height="\d+"/, 'width="700" height="700"')
fs.writeFileSync(out, svg)
console.log(out)
