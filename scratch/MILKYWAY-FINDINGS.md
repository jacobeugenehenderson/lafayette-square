# Milky Way — can we bring it back beautiful? (findings)

**Agent:** Vega · **Date:** 2026-07-18 · investigation only, no product changes landed.
**VERDICT (settled 2026-07-18): TABLED.** Not on quality or perf — the procedural approach solved both — but on **framing**: the Hero shot never looks high enough to see it. See §5. The procedural prototype worked and read better than the old panorama; it is reverted, and the full recipe is preserved below for the day Hero framing changes or Street view becomes a first-class destination.

**Original verdict (superseded by §5):** Worth it as a rebuild, not a re-enable. The old path exists and is one uncomment away, but it's the *ugly* photographic-panorama approach and won't run on a phone. The right answer is a **procedural galactic band in the sky shader**, joining the already-procedural star catalog. Jacob confirmed both halves ("it was ugly, start over" / "don't shelve the procedural alt, do the right one") — then the Hero-visibility check overrode it.

---

## 1. Where the celestial render path actually lives (premise was wrong)

The old "`CelestialBodies.jsx:~1194`, one-line uncomment" pointer is **stale on the path, not the fact.** The file was never removed or renamed:

- **Live file:** `src/components/CelestialBodies.jsx` (1298 lines). Added in the initial commit `ce97343d` (2026-02-08), continuously edited since, **never deleted/renamed** (`git log --all --follow --diff-filter=ADR` returns only the add). The pointer said ~1194 because the file has since grown to 1298.
- **Single celestial consumer:** the `CelestialBodies` component (`:1008`), resolving each channel `override ?? scene.json ?? default`:
  - `:1029` stars · `:1030` milkyWay · `:1028` constellations
- **Mounted live by all five renderers:** `Scene.jsx:11` (prod), `PreviewApp.jsx:17`, `StageApp.jsx:23`, `CartographApp.jsx:27`, `CanaryScene.jsx:40`.
- **Bake carry confirmed:** `cartograph/bake-scene.js:98` (`milkyWay`), `:97` stars, `:96` constellations. Baked LS scene today already has `milkyWay: {value: 1}`, `stars: {brightness: 1}`, `constellations: {value: 0}`.

**Current live state of the three celestial layers:**

| Layer | State today | Where |
|---|---|---|
| **Stars** (bright-star catalog + filler) | **LIVE**, every mount, faded by physical `astronomyAlpha` × operator `stars` knob | `CelestialBodies.jsx:869–962`, points at `:983–984` |
| **Constellations** | **LIVE but camera-gated** — Street/planetarium view only, all-day | `:975` gate, `PlanetariumOverlay.jsx` |
| **Milky Way** | **PRESENT but DORMANT** — component intact, JSX mount commented out | component `:363–425`, mount commented `:1264–1267` |

So the night sky *does* render celestial bodies today (stars always, constellations in Street). Only the Milky Way band is parked.

---

## 2. Re-enable, or rebuild? → **Rebuild.** And here's exactly why it was parked.

The Milky Way component (`MilkyWaySphere`) and its Stage knob are both preserved-but-commented, each with a note. The **operator-UI note is the real story** (`CartographSkyLight.jsx:147–152`):

> *"Milky Way hidden from operator UI 2026-05-02. Brunier panorama shows visible JPEG artifacting + stretched/oversized stars at Hero/Street FOV; needs higher-res source or cubemap rebuild before re-exposing."*

So it was parked **by the operator's eye, for being ugly** — the exact thing Jacob remembers. It is technically a one-line uncomment, but re-enabling literally brings back the version that got parked. Two independent problems:

**A. It's ugly (the eye reason).** The approach is an **equirectangular photographic panorama** (Serge Brunier's ESO 360° pano) wrapped `BackSide` on a sphere with `NormalBlending` — "the panorama *is* the sky." At the narrow Hero (fov 22) / Street (fov 75) FOV the texels magnify hard, so you see JPEG block artifacts and the photograph's *own* baked-in stars become stretched, oversized blobs — which then **fight the separately-rendered procedural star catalog** (two star systems, doubled and mismatched). Photographic realism at wide-field becomes mush at narrow-field.

**B. It won't run on a phone (the perf reason — this is a hard blocker, not a tuning issue).** The texture is `public/textures/milky_way.jpg`, **12000 × 6000, ~17 MB JPEG**:
- **12000 px exceeds the max texture size of essentially every mobile GPU.** WebGL's guaranteed floor is 2048; common mobile caps are 4096, high-end 8192, only desktops reach 16384. A 12000-wide texture will **fail to upload or be silently clamped** on phones → blank or garbage. This alone disqualifies the current asset for the phone target.
- Decoded to VRAM it is **12000×6000×4 ≈ 288 MB**, with `generateMipmaps:false`. That's a phone-killer against `project_smooth_pan_is_the_only_perf_target`, even where it *would* upload.

Note: there is **no `project_milkyway_parked.md` memory** despite the code referencing it, and **no BACKLOG entry** — the parking is documented only in the two in-code comments. (Worth writing the memory as part of this decision.)

**On screenshots:** I did not capture live before/after frames. Three reasons: (1) there is **no browser-automation harness in-repo** (no puppeteer/playwright; `scratch/` snapshot tools are geometry-to-JSON, not screen grabs) and spawning one / a second dev server is against project rules; (2) the running dev server serves the *main* checkout, not this worktree, so a worktree edit wouldn't surface without a temporary edit-and-revert on the served tree; (3) most importantly, the thing to screenshot is the **confirmed-ugly parked version Jacob already holds the eye-verdict on** — re-shooting it proves nothing we don't know. The stars-only current night sky is what renders today. If we want a frame, the high-value one is a **procedural prototype** (§3) for Jacob's eye — that's a product change and needs sign-off first.

---

## 3. What "beautiful" costs — the right approach: **procedural band, not a texture**

The whole celestial system here is **already procedural GLSL over view-direction**: the sky dome is a `ShaderMaterial` computing 4-band color + sun/moon glow per fragment; the moon is hand-authored GLSL (limb darkening, terminator, phase); the stars are a catalog rendered as points with sidereal rotation (same J2000/LST math already in-file). A photographic panorama was always the odd one out. **The right Milky Way joins the procedural family**, it doesn't reintroduce a bitmap.

**The approach (Jacob's call): dense fractal noise, live in the sky shader — zero texture.** Add a **galactic-plane band term to the `GradientSky` fragment shader.** For each fragment's view direction, compute angular distance to the galactic plane (orientation from the same sidereal machinery the star catalog uses), mask a soft band around it, and fill it with **dense fractal noise** — this is what makes it read as a galaxy and not a smear:

- **fBm (fractional Brownian motion)** — sum many octaves of value/simplex noise (each higher-frequency, lower-amplitude). Dense = high octave count → the fine mottled cloud grain that survives at any FOV.
- **Domain warping** — warp the noise sample coords by a second noise field. This is the trick that turns "clouds" into the *wispy flowing filaments* of the galactic clouds; it's the single biggest beauty lever.
- **Dark dust rift** — carve the iconic central lane by subtracting an offset/ridged noise, so the band isn't a solid glow but split by dust.
- **Color** — low-saturation warm core → cooler edges. **Author in NormalBlend, desaturated** — the parked note recorded that Additive blending shifted the whole thing to "milky green"; that's the trap to avoid.

It composites *under* the existing star points, so the two stop fighting. Resolution-independent by construction — no JPEG blocks, no oversized photo-stars, ever.

What it costs:

- **Shader authoring / art direction (the real work).** Tuning the octave count, warp strength, rift depth, band falloff, and color ramp by eye — the kind of iteration the project already does for clouds/neon. A focused authoring session or two, not a research project. Fits `feedback_no_reference_image_hunting` and `procedural-is-the-destination` doctrine — noise params *are* the operator knobs.
- **⚠️ The one perf watch-item (phone).** Dense fBm + domain warp is ~15–25 noise evaluations *per sky fragment*, and the dome is a lot of fragments — on a weak phone GPU that can bite `smooth_pan`. Three mitigations, in order of preference: (1) **mobile octave scaling** — fewer octaves on the mobile authored profile (`project_mobile_profile_authored_channel`), the band reads fine softer; (2) **skip the band pass entirely when `nightFactor ≈ 0`** (free by day); (3) if live cost is still too high, **bake the noise once at load into a small phone-legal RT** (≤2k×1k, ~8 MB) and sample it per-frame — keeps procedural *authoring* (the noise shader is the source of truth, resolution-independent) while paying only one texture fetch per frame. Start live (option 1+2); fall back to the bake (3) only if Jacob's eye on a real phone says pan stutters. Either way: dramatically lighter than today's 288 MB.
- **TOD blend (mostly already there).** The fade mechanism exists and is correct: opacity/contribution × `nightFactor` (`(0.05 − sunAlt)/0.20`, clamped) means it's invisible in daylight and comes up only as the sky darkens; `skyGain` already owns "how dark is the night sky" and stars are intentionally not scaled by it so they read better. The band rides the same rails. The dawn-washout worry is *solved by construction* — as sunAlt rises, nightFactor → 0 and the band fades before the sky brightens. The authored `milkyWay` channel (the existing on/off knob, resolver-lerped across TOD slots) becomes the operator's master.
- **Perf: near-zero.** No texture (or one tiny phone-legal detail map). A handful of extra fragment instructions on a dome that's already drawn. This is the *point* — it's the only approach that is unconditionally phone-safe. Contrast: 0 MB (or ~4–8 MB for a 1–2k detail map) vs. 288 MB.

**Reuse:** the channel, store actions, bake carry, resolver, `nightFactor`, `skyGain`, and the mount site all already exist. The dormant `MilkyWaySphere` gets **deleted** (and the 17 MB texture with it); a procedural band term goes into `GradientSky`. Net: less code and less asset weight than today.

---

## 4. Recommendation

**Worth-it-with-work — and the work is a rebuild, procedural.** Not a slam-dunk (a re-enable would ship the ugly, phone-breaking version), not not-worth-it (the infrastructure — channel, knob, TOD fade, procedural star substrate — is all there and healthy; this is the last celestial layer missing, and a night Milky Way is exactly the kind of "premier product" aesthetic the home stretch is about).

**The one tradeoff:** procedural means **stylized/painterly, not literal photographic realism.** We give up the exact ESO photograph in exchange for something that stays crisp at every FOV, blends with our own stars and TOD dome, is fully operator-authorable, and actually runs on a phone. Given the kit's procedural-is-the-destination philosophy and the hard mobile texture-size wall, that trade is the *right* one, not a compromise.

**Proposed next step (needs Jacob's sign-off — a product change):** wire a first procedural-band prototype into `GradientSky`, view it at deep-night + dawn in the running app, tune by Jacob's eye. Delete `MilkyWaySphere` + `milky_way.jpg` once the band lands. Write the missing `project_milkyway_parked.md` → rename to `project_milkyway_procedural` capturing this decision.

---

## 5. The killer: Hero never looks up (why it's tabled)

We built the procedural band (§dev-recipe below), wired it live, and Jacob eyed it — "looking better." Then the decisive question: **does the Hero camera ever frame the overhead sky?** It does not.

The Hero pan plays 3 authored keyframes (baked `heroKeyframes`), all aimed at the hero subject `[400, 45, -100]`:

| Hero keyframe | Camera pitch | FOV | Top edge of frame |
|---|---|---|---|
| 0 `[-190,107,370]` | −4.7° (down) | 26° | **+8.3° elevation** |
| 1 `[-614,114,183]` | −3.8° | 24° | +8.3° |
| 2 `[-634,113,-117]` | −3.8° | 22° | +7.2° |

Hero is an architectural hero shot — aimed slightly *down* at the buildings, top of frame ~**+8° above the horizon** for the whole pan. The Milky Way's dramatic arc sits at **30–65° elevation** (band ⟂ galactic pole; with the pole ~25° up, the arch peaks ~65°). It is entirely above the Hero frame. Only a faint horizon-crossing sliver could ever appear low in Hero, competing with haze + the arch + rooftops — not the payoff. Tilting Hero up would break the whole hero framing (a fixed product decision, `project_camera_framing_slab_contract`).

**It reads only in Street/planetarium (look-up) view.** Jacob's bar is Hero → **tabled.** The one consolation, if Street ever becomes a first-class destination: the band is near-free perf and already recipe-complete below, so reviving it there is cheap.

**Lesson for the talk-out:** the celestial-body question isn't "can we render it beautifully + cheaply" (yes) — it's "does the money shot ever point at the sky." For an architectural hero pan, it doesn't. Worth checking camera framing *first* for any sky-feature proposal (moon glow, aurora, better stars all share this constraint — note stars/constellations are already gated to Street for the same reason).

---

## Dev recipe — the procedural band (preserved, reverted from tree)

Reverted from `src/components/CelestialBodies.jsx` (`git checkout` — the file was clean before). To revive, re-apply these 6 edits to `GradientSky`:

1. **Signature** — add `milkyWayChannel` prop to `function GradientSky({ … })`.
2. **Uniforms** (in `skyMaterial`, after `uSkyGain`): `uMilkyWay: { value: 0.0 }`, `uGalPole: { value: new THREE.Vector3(0.8, 0.4, 0.3).normalize() }`.
3. **Fragment decls + noise** (before `void main()`): `uniform float uMilkyWay; uniform vec3 uGalPole;` + `mwHash`/`mwNoise`/`mwFbm` (hash-based 3D value noise, 6-octave fBm).
4. **Band term** (after `finalColor *= uSkyGain;`): gate `float mwGate = uMilkyWay * clamp((0.05 - sunAlt)/0.20, 0.0, 1.0);` then inside `if (mwGate > 0.001)`: galactic-latitude band `exp(-gLat*gLat*8.0)`, domain-warped fbm (`warp = vec3(mwFbm(q+11.5), mwFbm(q+27.1), mwFbm(q+43.7))`, `clouds = mwFbm(q*1.7 + warp*1.8)²`), dust rift via a 2nd noise + `smoothstep(0.35,0.75,rift)`, color `mix(vec3(0.36,0.40,0.52), vec3(0.72,0.70,0.62), clouds)`, `finalColor += milkColor * milk * mwGate * 0.9`.
5. **Driver** (in `useFrame`, after weather uniforms): resolve `milkyWayChannel` via `resolveGroupAtMinute(…, MILKYWAY_FIELD_KEYS, MILKYWAY_FLAT_DEFAULTS)` → `u.uMilkyWay.value`.
6. **Mount** (`<GradientSky … />`): pass `milkyWayChannel={milkyWayChannel}` (already resolved at the CelestialBodies scope).

Composited *after* `uSkyGain` so night-dimming the dome lets it rise (like the separate star layer). Added AFTER the dome bands, BEFORE `gl_FragColor`. Tuning dials by eye: `uGalPole` (arc), band falloff `8.0` (width), final `*0.9` (brightness), noise scales `4.0`/`1.7`, warp `1.8`, rift `smoothstep`, `milkColor` (temperature).
