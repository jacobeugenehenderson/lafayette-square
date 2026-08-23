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

⛔ **The shared master atlas is NOT needed.** `trees-atlas-color.png` (7.5 MB)
and friends pack *every* species for a whole neighborhood. One specimen never
needed them. (This brief's author claimed otherwise mid‑session and was wrong.)

**A published GLB is only half dressed.** It carries ONE material — the bark —
applied to `BranchesSG`, `CapsSG` **and** `LeavesSG`. Undressed, the canopy
renders as bark‑coloured cards. Full finding, with the second trap it hides
(node names do not survive `GLTFLoader`; every mesh reports parent `Scene`), is
in **`arborist/BACKLOG.md`**, dated 2026‑08‑22. Read it.

**The chassis is geometry only.** `public/trees/_chassis/american_linden_a.glb`
is 50 MB, 535,140 tris, modelled leaves, **zero textures**. It is not a
shortcut — leaf *geometry* cannot look like a photographed leaf pack.

---

## 2. The blocker, and it is the whole job

**`?embed=sky` mounts and its canvas never sizes.** Route resolves, WebGL
context is created, **no errors are thrown**, every ancestor measures correctly
(896 × 336) — and the canvas sits at R3F's default **300 × 150**.

- Code: `src/components/SkyEmbed.jsx`, and the embed branch in `src/App.jsx`
  (search `route.embed`).
- Hypothesis on the table, unproven: R3F measures its container once on mount
  and then waits for a resize; a frame loads at its final size, so no resize
  ever arrives, and a first measurement taken before layout sticks forever.

⛔ **Already ruled out — do not spend time re‑testing these:**
- a stale dev server (restarted; same result)
- console errors (none, checked inside the frame)
- a missing WebGL context (present)
- wrong ancestor heights (all correct)
- `width`/`height` in the Canvas `style` prop — **this made it worse**; it lands
  on the canvas element and clobbers the sizing R3F is applying
- a `requestAnimationFrame` resize nudge (in the file; did not help)

▶ **Untried and most promising:** bypass R3F's own measurement entirely — a
child component inside `<Canvas>` that reads `gl.domElement.parentElement`'s
rect and calls `setSize` directly, re‑running on a `ResizeObserver`. The app's
own canvases size fine, so the fault is specific to this route, not to Canvas.

⭐ **THERE IS NO SECOND BLOCKER — and an earlier draft of this brief said there
was.** It claimed the tree GLBs were undeployed, because a page asked staging
for `/trees/<species>/…` and got a 404. **That 404 is correct.**
`public/trees/` is the Arborist's **authoring source pool**, gitignored on
purpose (`.gitignore:230`, which also names what runtime consumes instead).

**The deployed tree is `/baked/<look>/trees/<species>/skeleton-N-lodN.glb`, it
is tracked, and staging serves it right now.** Confirmed:

```
…/lafayette-square-staging/baked/lafayette-square/trees/linden_american/skeleton-1-lod1.glb  200  6.4 MB
…/baked/lafayette-square/trees-atlas-color.png                                               200  7.5 MB
…/baked/lafayette-square/trees-atlas-normal.png                                              200  4.6 MB
```

⚠️ **The baked tree is a DIFFERENT artifact from the source tree, and they dress
differently. Do not mix them up as this brief's author did:**

| | source pool (`/trees/…`) | the bake (`/baked/<look>/trees/…`) |
|---|---|---|
| deployed | **no**, by design | **yes** |
| material | `EuropeanLindenBark_Mat`, bark map embedded | `TreeAtlas`, **no embedded textures** |
| dressing | bark kit + leaf atlas tile, bound by hand | the Look's shared atlas, bound by the runtime |
| lod1 | 809 KB | 6.4 MB (placement-substituted, 172,998 tris) |

⭐ **So for a deployed embed the atlas is not optional — `TreeAtlas` is what the
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
- ⚠️ **Caching lies at two levels.** Confirm what RAN is what is on disk before
  believing any symptom.

---

*Written 2026‑08‑22 at the end of the session that produced the finding. The
website half of this work — what it took to link a page to this product — is
documented in `~/Desktop/dev.nosync/theward-online/INTEGRATION.md`.*
