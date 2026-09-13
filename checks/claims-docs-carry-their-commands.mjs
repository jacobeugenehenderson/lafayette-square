#!/usr/bin/env node
// ⭐⭐⭐ THE DOC WRAP, AS A GATE INSTEAD OF A PROMISE. (Jacob, 2026-09-07: "The docs must be fixed
// when we wrap!") ▶ node checks/claims-docs-carry-their-commands.mjs [--list]
//
// `CLAUDE.md` states two rules that are mechanically checkable, so they are checked, not restated:
//  1. ⛔ "Never write a number into a doc without the command that reproduces it — and prefer
//     DELETING the number and keeping the command." A count in prose is stale the moment it is
//     written and is then quoted for months by people who cannot re-derive it.
//  2. ⛔ "'RESOLVED, kept for context' left in place is the anti-pattern, and so is a correction
//     banner sitting next to the false sentence it corrects — EXCISE the sentence."
//
// ⛔ THIS IS A LINT, NOT A JUDGE. It cannot tell ROT from REGRESSION from ASPIRATION — that is the
// judgment `CLAUDE.md` sends to Boz, and it is the whole reason a conformance pass deletes decisions
// if it runs on autopilot. What it CAN do is stop the corpus growing new instances while we sleep.
import fs from 'fs'
const DOCS = ['cartograph/SECTION.md','cartograph/RIBBONS.md','cartograph/SKELETON.md','cartograph/PIPELINE.md',
              'cartograph/SURVEY.md','cartograph/PREBAKE.md','cartograph/POLYGON-FIRST.md','ORIENTATION.md','README.md']
const BANNER = /(RESOLVED,? kept|kept for context|superseded but|no longer true|this is now wrong|correction:|✅ CURED|was wrong above)/i
// ⛔ A QUOTABLE CLAIM, NOT ANY NUMBER. First pass flagged 505 lines and was catching dates, § refs,
// line numbers and years — a noisy lint is the same defect as a blind one, and I shipped three of
// those today before catching this one. Narrowed to the two shapes `CLAUDE.md` is actually about:
// a PERCENTAGE, and an "N of M" census. Those are what get quoted for months.
const FIG = /(\b\d+(\.\d+)?\s?%|\b\d{1,5} of \d{1,5}\b)/
const NOISE = /(20\d\d-\d\d-\d\d|§|:\d+\b|\b[0-9a-f]{7,40}\b)/
const LIST = process.argv.includes('--list')
let totFig = 0, totBan = 0, files = 0
for (const p of DOCS) {
  if (!fs.existsSync(p)) continue
  files++
  const lines = fs.readFileSync(p,'utf8').split('\n')
  let fence = false, fig = 0, ban = 0
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    // ⛔ A FENCE INSIDE A BLOCKQUOTE IS STILL A FENCE. This read /^\s*```/ and so went blind
    //    to every "> ```" block — RIBBONS.md fences almost everything that way, so the check was
    //    scanning measured tables it is explicitly meant to skip and reporting their cells as
    //    bare prose figures. The instrument was wrong, not the doc.
    if (/^\s*(>\s*)*```/.test(L)) { fence = !fence; continue }
    if (fence) continue
    if (BANNER.test(L)) { ban++; if (LIST) console.log(`  BANNER  ${p}:${i+1}  ${L.trim().slice(0,110)}`) }
    if (!FIG.test(L)) continue
    if (NOISE.test(L) && !/%|\d of \d/.test(L.replace(NOISE,''))) { /* keep: the figure survives the noise strip */ }
    // a figure is EXCUSED if its own line, or one within two lines, names the command that makes it
    const near = lines.slice(Math.max(0,i-2), i+3).join(' ')
    if (/▶|node scratch\/|node checks\/|`node |git |grep |\.mjs\b/.test(near)) continue
    // ⭐ …and a figure that is explicitly HISTORICAL is excused too, because no command can
    //    reproduce it: the mechanism it measured is GONE. "vetoed 54.8% of LS's arcs" describes
    //    a rule retired 2026-09-08 — demanding a reproducing command for it asks the doc to run
    //    code that no longer exists, and deleting the number would erase why the rule was retired.
    //    ⛔ The excuse requires an EXPLICIT marker on or beside the line, never a guess at tense:
    //    the harm this check exists to prevent is a stale figure read as CURRENT, and a figure
    //    labelled retired cannot be read that way.
    if (/\bRETIRED\b|\bwas retired\b|\bno longer\b|\buntil 20\d\d-\d\d-\d\d\b|\bexcised\b/i.test(near)) continue
    fig++
    if (LIST) console.log(`  FIGURE  ${p}:${i+1}  ${L.trim().slice(0,110)}`)
  }
  console.log(`  ${p.padEnd(30)} bare figures ${String(fig).padStart(4)} · banners ${String(ban).padStart(3)}`)
  totFig += fig; totBan += ban
}
console.log(`\n${files} canon docs · ${totFig} figures with no reproducing command · ${totBan} correction banners / supersessions`)
console.log(totFig || totBan
  ? `⛔ FAIL — a number nobody can re-derive gets quoted for months, and a banner outlives the sentence it corrects.`
  : `✅ PASS — every figure carries its command, and no banner sits beside a live falsehood.`)
process.exit((totFig || totBan) ? 1 : 0)
