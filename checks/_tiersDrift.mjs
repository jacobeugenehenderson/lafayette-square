// _tiersDrift.mjs — WHERE TODAY'S CLASSIFICATION AND THE COMMITTED checks/TIERS.json DISAGREE (Boz, 2026-10-21).
// Pure: no imports, no I/O. The runner (`run.mjs`) feeds it tier.mjs's fresh `classifyAll()` and the committed file, and
// refuses to run on any drift; `claims-the-tiers-are-current.mjs` mutation-tests it with planted classifications.
// ⭐ WHY: the runner derives each tier at run time and never reads TIERS.json, so a check that turned unreadable left
//   `npm test` SILENTLY while the committed table still said `safe` (2026-10-21: two deformer checks, found by hand).
// @param recorded the committed TIERS.json (parsed) · @param today [{ file, tier, why }] from classifyAll()
// @returns { changed: [{ file, from, to, why }], added: [{ file, tier, why }], removed: [{ file, tier }] }
export function tiersDrift(recorded, today) {
  if (!Array.isArray(recorded?.checks)) throw new Error('tiersDrift: the committed TIERS.json carries no `checks` list — nothing to compare against')
  const was = new Map(recorded.checks.map(c => [c.file, c])), is = new Map(today.map(r => [r.file, r]))
  const changed = [], added = [], removed = []
  for (const [file, r] of is) { const c = was.get(file)
    if (!c) added.push({ file, tier: r.tier, why: r.why || [] })
    else if (c.tier !== r.tier) changed.push({ file, from: c.tier, to: r.tier, why: r.why || [] }) }
  for (const [file, c] of was) if (!is.has(file)) removed.push({ file, tier: c.tier })
  return { changed, added, removed }
}

export const driftCount = (d) => d.changed.length + d.added.length + d.removed.length

// one line per drifted check, for the runner's refusal
export function driftLines(d) {
  return [
    ...d.changed.map(x => `${x.file}: ${x.from} → ${x.to}${x.why.length ? ` (${x.why.join(' · ').slice(0, 240)})` : ''}`),
    ...d.added.map(x => `${x.file}: classified ${x.tier} today, absent from TIERS.json`),
    ...d.removed.map(x => `${x.file}: in TIERS.json (${x.tier}), no longer classified`),
  ]
}
