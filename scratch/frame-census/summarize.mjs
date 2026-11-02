import { readdirSync, readFileSync } from 'node:fs'
const runs = readdirSync('runs').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync('runs/' + f, 'utf8')))
const towns = ['lafayettesquare', 'hipointedemun', 'huron', 'provincetown']
const shotKey = (r) => `${r.shot}${r.close ? '-close' : ''}`
const order = ['browse', 'hero', 'hero-close']
const classes = ['trees', 'ground', 'lamps', 'buildings', 'water', 'displays', 'sky']
const pct = (v) => v == null ? '—' : (v * 100).toFixed(0) + '%'
let out = ''
for (const t of towns) for (const m of ['desktop', 'phone-hi']) for (const s of order) {
  const r = runs.find((x) => x.town === t && x.mode === m && shotKey(x) === s); if (!r) continue
  const settled = !r.log.some((l) => /never settled/.test(l))
  out += `\n#### ${t} · ${s} · ${m}${settled ? '' : ' (mid-playback)'}\nframe ${r.frame0.calls} draws · ${(r.frame0.tris / 1e6).toFixed(2)}M tris · GPU ${r.frame0.gpuMs?.toFixed(0)} ms · window ½: ${r.px?.[0]?.ms?.toFixed(0)} → ${r.px?.[1]?.ms?.toFixed(0)} ms · load ${r.load[0].toFixed(1)}\n\n| class | instances | tris | in frustum | unoccluded | visible≈ | Δ GPU ms (±) |\n|---|---|---|---|---|---|---|\n`
  for (const c of classes) { const x = r.rows.find((y) => y.cls === c); if (!x) continue
    out += `| ${c} | ${x.instances} | ${(x.tris / 1e6).toFixed(2)}M | ${pct(x.inFrustumShare)} | ${pct(x.unoccludedShare)} | ${pct(x.visibleEst)} | ${x.dGpuMs.toFixed(1)} (±${x.noise.toFixed(1)}) |\n` }
}
console.log(out)
