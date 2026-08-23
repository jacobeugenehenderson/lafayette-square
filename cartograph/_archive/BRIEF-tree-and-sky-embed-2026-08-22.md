# BRIEF — a live tree (and the sky) the marketing site can embed

**You are a fresh agent.** Do not read `BOZ.md`. Read `CLAUDE.md` (the gate), then
this, then the code sites named below **before** forming a plan.

**The deliverable, in one line:** a Ward surface that renders **one tree, fully
dressed, live** — and can be framed by another page. The sky is the same shape
of problem and is the stretch goal; if you get the tree, you have won the day.

> ⚠️ **Every premise below is a CLAIM, not a fact.** They were established in one
> long session on 2026‑08‑22 by looking, and several earlier claims in that same
> session turned out to be wrong. **Confirm against the code and say what you
> found before you build.** If the code contradicts this brief, the code is
> right and the contradiction is the work.

---

## 1. What is already true (confirm each)

**The tree works today.** A *source-pool* GLB, dressed by hand with a bark kit
and the Look's leaf atlas tile, renders as a real leafy tree. Verified in an
off‑the‑shelf three.js viewer with no Ward code in it — note this is the
authoring artifact, not the deployed one; see §2 for the difference:

```
scratch/tree-viewer.html?tree=tilia_americana&lod=0&bark=bark_brown_01
  → 202,936 tris · 207 ms · 31.0 m · green foliage · photo-PBR bark
```

That viewer is deliberately dumb — no Ward imports — so it shows what the files
actually contain. `?raw=<path>` loads any model untouched. Use it to check
anything you doubt.

**What a dressed tree costs**

| part | where | size |
|---|---|---|
| geometry `lod1` | `public/trees/tilia_americana/skeleton-1-lod1.glb` | 809 KB (4,977 tris) |
| geometry `lod0` | same, `-lod0.glb` | 18 MB (202,936 tris) |
| bark kit | `public/textures/bark/<kit>/{color,normal,roughness}.jpg` | ~5 MB |
| leaf atlas tile | `public/baked/lafayette-square/trees-atlas-leaves-color.png` | 1.3 MB |

⚠️ **For THIS path — the source pool — the shared master atlas is not needed.**
`trees-atlas-color.png` (7.5 MB) packs every species for a whole neighborhood,
and a hand-dressed specimen never touches it.
⛔ **That is NOT true of the baked path, which is the one that deploys.** See §2:
there the material is literally called `TreeAtlas` and carries no textures of its
own. The two pipelines dress differently and this brief's author got the atlas
question wrong in both directions before separating them.

**A published GLB is only half dressed.** It carries ONE material — the bark —
applied to `BranchesSG`, `CapsSG` **and** `LeavesSG`. Undressed, the canopy
renders as bark‑coloured cards. Full finding, with the second trap it hides
(node names do not survive `GLTFLoader`; every mesh reports parent `Scene`), is
in **`arborist/BACKLOG.md`**, dated 2026‑08‑22. Read it.

**The chassis is geometry only.** `public/trees/_chassis/american_linden_a.glb`
is 50 MB, 535,140 tris, modelled leaves, **zero textures**. It is not a
shortcut — leaf *geometry* cannot look like a photographed leaf pack.

---

## 2. ⛔ THIS SECTION'S CLAIM WAS MEASURED FALSE. `?embed=sky` WORKS.

**Superseded 2026‑08‑22 by the agent this brief was written for.** Kept, not
deleted, because the *way* it was wrong is the reusable part.

**What this section said:** the canvas mounts at R3F's default 300 × 150 and
never sizes, and that is the whole job.

**What is true:** it sizes correctly on the first real paint. Measured on a
clean load, nothing changed to produce it — the only variable was that the tab
got **painted** in between:

```
t=1000ms   canvas attr  300 x  150   style w=""      h=""       rect  300 x 150
t=5500ms   canvas attr 1344 x  504   style w="896px" h="336px"  rect  896 x 336
```

**Root cause, in the dependency and not in the route.** R3F v8's `Canvas` sizes
through `react-use-measure` and gates its whole setup on the result:

```js
// @react-three/fiber …/react-three-fiber.cjs.dev.js:92
if (containerRect.width > 0 && containerRect.height > 0 && canvas) { … createRoot(canvas) … }
```

`react-use-measure` reports through a `ResizeObserver`, and **a ResizeObserver
cannot deliver while the frame is not being painted.** In a throttled or
background tab the callback never fires, `containerRect` stays 0, `createRoot`
is never called, and the canvas keeps the HTML default. It self‑heals on the
first paint. ⭐ **There is no stuck first measurement — no measurement was ever
taken.** The hypothesis this section used to advance is false.

⚠️ **The `rAF` resize nudge at `src/components/SkyEmbed.jsx:44‑47` is inert for
this cause** — rAF is throttled by the same thing that throttles the observer —
and its comment states the disproven hypothesis as fact. It should come out.

### ⭐⭐ THE TRAP THAT PRODUCED THE FALSE CLAIM — this one is worth keeping

⛔ **`canvas.getContext('webgl2')` CREATES the context. It can never tell you one
already existed.** This brief's author called it to prove the context was fine,
got a live `WebGL2RenderingContext` back from a canvas R3F had never touched,
and wrote *"WebGL context is created, no errors are thrown"* into the ruled‑out
list — where it then protected the wrong diagnosis from being re‑examined.

⭐ **The honest reading was sitting right there: `style.width` was EMPTY.**
`gl.setSize` had never run, so there was no R3F root at all.

That is **§4's own rule one level down** — *verify on computed state, never on
the property you just set*. A getter that mutates is the sharpest form of it,
and this is the second time in two days that rule was broken by someone who had
just written it down.

⚠️ **And the observation itself was never certified.** The author cannot say the
tab was foregrounded and visible when the 300 × 150 was seen — the inspection ran
through browser automation across several tabs. ⛔ **An uncertified observation
was reported as a blocker and put a whole day's work behind it.**

---

### The tree that actually deploys — and it is NOT the one in §1

⭐ **`/baked/<look>/trees/<species>/skeleton-N-lodN.glb` is tracked and staging
serves it right now.** An earlier draft of this brief claimed the tree GLBs were
undeployed, because a page asked staging for `/trees/<species>/…` and got a 404.
**That 404 is correct.** `public/trees/` is the Arborist's authoring source pool,
gitignored on purpose — `.gitignore:230` says so, and names what runtime
consumes instead.

```
…/baked/lafayette-square/trees/linden_american/skeleton-1-lod1.glb  200  6.4 MB
…/baked/lafayette-square/trees-atlas-color.png                      200  7.5 MB
…/baked/lafayette-square/trees-atlas-normal.png                     200  4.6 MB
```

⚠️ **The two artifacts dress differently. Do not mix them up as this brief's
author did, in both directions, on the same day:**

| | source pool (`/trees/…`) | the bake (`/baked/<look>/trees/…`) |
|---|---|---|
| deployed | **no**, by design | **yes** |
| material | `EuropeanLindenBark_Mat`, bark map embedded | `TreeAtlas`, **no embedded textures** |
| dressing | bark kit + leaf atlas tile, bound by hand | the Look's shared atlas, bound by the runtime |
| lod1 | 809 KB | 6.4 MB (placement-substituted, 172,998 tris) |

⭐ **So on the deployed path the atlas is not optional — `TreeAtlas` is what the
material is called.** Budget ≈ 6.4 MB + 7.5 MB colour (+ 4.6 MB normal). Heavy,
and Jacob's call was *"this is marketing, we can push it."*

▶ **Prefer the baked path.** It is what ships, what the runtime already binds,
and it needs no new published artifact.

---

## 3. What to build

**`?embed=tree`** — chrome‑only, framed‑only, exactly like the embeds that
already work. Precedent to copy, in `src/App.jsx`: `?embed=society`,
`?embed=masthead`, `?embed=card`, `?embed=sky`. Read all four before writing a
fifth; they establish the pattern and its rules.

It should mount one specimen, dressed as §1 describes, with:
- wind sway (the Salon's workstage has a wind toggle — find how it drives the
  material and reuse it; do not reimplement)
- the **sky as its environment**, not the Salon's cyclorama — which is why the
  sky embed and the tree embed want to become **one scene**, not two frames
- the time arriving by `ward-time`, like every other embed, so an embedding
  page's slider moves the light

⭐ **The right end state, and it is Jacob's:** one embed that is the **diorama** —
sky and tree in a single Canvas, lit together, one clock. Do not build two
frames and stack them.

⭐ **And the right home for "a whole tree" is a new Arborist view — "the full
monte"**: one specimen at source resolution, full bark PBR, the real leaf pack,
wind, lit by a sky. There is currently no view anywhere in the product that
shows a finished tree, which is why its publish contract could go half‑dressed
without anyone noticing. If you build the embed, consider whether it *is* that
view, framed.

---

## 4. Rules that apply here (from the session that produced this)

- ⛔ **No captures.** A still cannot sway, cannot follow the slider, and cannot
  take scene light. Three of the five things wrong with the last attempt were
  unfixable by any image. Jacob: *"I never asked for a still image."*
- ⛔ **Never composite impostor shells.** They are depth proxies — cards at a
  quarter and three quarters of canopy depth — not layers of a picture.
  Flattening them puts bark outside the canopy.
- ⛔ **No dead controls in an embed.** See `.embed-card` in `src/index.css`: the
  close button and the claim bar are hidden because their flows cannot complete.
- ⛔ **Never hide or pause a live canvas.** `src/index.css` `.embed-sheet`
  carries the measurement: 5624 ms opaque vs 224 ms at 0.98.
- ⚠️ **Verify on computed state, never on the property you just set.** An SVG
  `hidden` bug survived a check that read back the same property it wrote.
  ⛔ **Its sharpest form is a GETTER THAT MUTATES** — `canvas.getContext()`
  *creates* the context, so it can never report one missing. See §2: that call
  put a false "already ruled out" into this brief and protected a wrong
  diagnosis for a day.
- ⛔ **An uncertified observation is not a finding.** If you cannot say the tab
  was foregrounded, the build fresh, the cache cold — say *"cause not
  established"* and stop. §2 is what happens otherwise.
- ⚠️ **Caching lies at two levels.** Confirm what RAN is what is on disk before
  believing any symptom.

---

*Written 2026‑08‑22 at the end of the session that produced the finding. The
website half of this work — what it took to link a page to this product — is
documented in `~/Desktop/dev.nosync/theward-online/INTEGRATION.md`.*
