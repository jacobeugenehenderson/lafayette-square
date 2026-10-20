# CLAUDE.md — the Check A receipt, RETIRED 2026-10-20

*Moved out of `CLAUDE.md` Layer 0 by Boz, at Jacob's direction to keep things SSoT. Why it went:*
- *Lintel's legacy-pass retirement (branch `retire-legacy`, 80d28a26) found that Check A
  (`cartograph/litmus-curb-parallel.mjs`) also scored `_shapeArtifact` with no proto flag, i.e. the LEGACY chain curb
  nobody draws. So it was blind three ways, not two.*
- *After the deletion it refuses at build.*
- *The receipt was prose restating code, with line numbers that drifted twice.*

*Replaced by a pointer to a check that reads the code sites.*

---

**The standing evidence that this is real, not rhetoric — `POLYGON-FIRST §2.1` Check A, measured
2026-07-31, OPEN and verified still open 2026-08-06:** the kit's whole premise is *"let the machine
catch the bugs — that checker is the real prize"* (`ORIENTATION`). **Our flagship curb checker is
blind in both of Layer 0's failure modes at once.** `cartograph/litmus-curb-parallel.mjs:77` passes
**`blockCustoms: null`** — it runs with **authoring switched off** — so it compares an *authored* curb
against the *un-authored* width and reports **the operator's own decision as a defect**. Mississippi
Avenue: authored half-width 8.70 m, curb at 8.70 m, dead parallel — scored a **3.13 m bow**. ⭐ That
is **question 3 committed by an instrument**, and it fails *worst on the most heavily authored town
and cleanest on a fresh pour* — blind exactly where the map is most worked-on. And `:86` —
`if (!tile?.iA?.length) continue` — **silently skips a tile with no curb ring at all**, so *"this
block has no curb"* prints as *"bows 3.9 m."* ⭐ That is **question 2**: a silent substitution inside
the one place it must never happen — the detector itself. *(The fix is not a better threshold: run it
**with** the scene's `blockCustoms`, and report an absent/degenerate ring as its own **loud** failure
class. Until then Check A's aggregate is not evidence of anything.)*

> *⭐ **Receipt RE-VERIFIED IN THE CODE 2026-08-29** and it still holds: `blockCustoms: null`
> at `litmus-curb-parallel.mjs:77`, the silent `continue` at `:86` — both at the lines quoted
> above, so Check A is still blind in both of Layer 0's failure modes. Nothing to re-arm; the
> slot is doing its job. (Checked because this paragraph says to, and it has been wrong twice.)*
>
> *Receipt re-armed 2026-08-06, twice over. This slot cited `measureModel.js` bleeding LS widths into
> every scene — **fixed 2026-07-31 (`08d61ce1`)**; it was then re-armed with A07's two-producer
> disclosure — **which landed 2026-08-04** (`producer` + `producerReason` are stamped on every tile,
> `tileGround.js:3749`; the census prints per pour; the *"Falling back to legacy is never a
> regression"* comment is gone). Both times the text sat here claiming OPEN what was closed — the gate
> doc proving its own doctrine with an expired receipt, **including the line numbers, which had all
> drifted.** ⭐ **When you close a fallback, come back and re-arm this slot with a live one — and
> RE-VERIFY the receipt in the code before you trust it.** A doctrine whose evidence doesn't check out
> teaches agents to stop trusting the first read, which is the adherence we can least afford to lose.*
