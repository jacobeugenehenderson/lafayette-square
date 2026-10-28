// The water shader's two depth readers, as the probe models them from waterMaterial.js's source (probe.mjs reads and
// passes the constants). No imports, so a mutant copy runs from the OS temp dir.
//   K = { V, F, kT, kSecchi, AW: [r, g, b], ripple: [lo, hi], F0, deepSee }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export function readers(K) {
  const seen = (d) => 1 - smooth(K.V - K.F, K.V, d)
  const tint = (d) => 1 - Math.exp(-K.kT / K.V * d)
  // makeWaterMaterial's composite inside the drawing (wPast = 0): mix(wDeepA, a·wTint, wSeen), then the Fresnel floor at a
  // straight-down view (cosV = 1, the least floor: F0), for the sheet's ripple alpha a
  const alpha = (d, a) => Math.max(K.F0, (1 - seen(d)) * ((1 - K.deepSee) * 1 + K.deepSee * a) + seen(d) * a * tint(d))
  const kc = K.AW.map(a => Math.max(0, K.kSecchi / K.V - K.AW[1]) + a)
  // makeWaterAbsorption: T = exp(−2 k d), the colour shift T / T.g clamped to 1
  const shift = (d) => { const t = kc.map(k => Math.exp(-2 * k * d)); return t.map(x => Math.min(1, x / t[1])) }
  return { seen, alpha, shift }
}
// what the viewer SEES (the shader reads the field's depth dF) against what the drawn ground is (its depth dD)
export function errors(R, K, dF, dD) {
  return {
    seen: Math.abs(R.seen(dF) - R.seen(dD)),
    alpha: Math.max(...K.ripple.map(a => Math.abs(R.alpha(dF, a) - R.alpha(dD, a)))),
    shift: Math.max(...R.shift(dF).map((s, c) => Math.abs(s - R.shift(dD)[c]))),
  }
}
