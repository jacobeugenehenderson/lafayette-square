// treesReveal.js — THE TREES' PART OF THE REVEAL, decided in one pure function (InstancedTrees.jsx's effect applies it), so a
// check can plant a load and read the verdict (2026-10-28, LS's black Stage: the grove's atlas was absent, the trees never
// marked prepared NOR failed, and the RevealGate held the town hidden behind a silent sky).
//   → { failed: '<why>' } — a load that will never arrive, named (the gate then says "held hidden: trees (…)")
//   → { prepared: true }  — every page, material and model the placed trees need has arrived (or no trees are drawn)
//   → null                — still arriving
// ⛔ A failed load is never a wait: it is named, as HeroImpostorTrees and OverheadTrees name theirs.
import { markPrepared, markFailed } from '../lib/startupMarks.js'

export function treesRevealVerdict({ drawsNoTrees, groups, atlas, mats, pagesIn, meshKeys, meshLoaded, lookName }) {
  if (drawsNoTrees) return { prepared: true }
  const why = (e) => e?.message || (e ? String(e) : 'no reason given')
  if (atlas?.status === 'error') return { failed: `the grove's atlas did not load for ${lookName} (${why(atlas.error)})` }
  if (mats?.status === 'error') return { failed: `the tree materials did not load for ${lookName} (${why(mats.error)})` }
  if (!groups || atlas?.status !== 'ready') return null
  if ((groups.meshGroups.size > 0 || groups.impostors.size > 0) && mats?.status !== 'ready') return null
  if (!pagesIn || meshKeys.some((k) => !meshLoaded.has(k))) return null
  return { prepared: true }
}

/** The verdict, marked: prepared → markPrepared('trees'), failed → markFailed('trees', why). */
export function applyTreesReveal(v) {
  if (v?.failed) markFailed('trees', v.failed)
  else if (v?.prepared) markPrepared('trees')
}
