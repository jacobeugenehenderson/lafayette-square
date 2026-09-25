# BRIEF — The Pilgrim Monument: rough in the plinth and its site (the tower model comes from an artist)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-25
evict-when: Provincetown's monument site is roughed in from the dossier's documented values (plinth, base, grade, a placeholder mass at true height), seated on the lidar, the artist's model has a slot to drop into, and Jacob has seen it at the hero camera.
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-25, and **Jacob dispatches.**

## Who you are

**Name yourself: one word, your own.** **Agent: FRESH, graphics.** You're the one active agent; be lean with tokens.

## Jacob's ask

> *"I also have a build dossier for the PTown monument; I will have to hire an artist to create the actual model but we can get the main plinth and area around it roughed in."*

## The source

`/Users/jacobhenderson/Desktop/Pilrgimn Mons/Pilgrim_Monument_Reconstruction_Dossier.pdf` (9 pp.), converted from Carpenter 1911, whose scan sits in the same folder. Its confidence codes govern:
- **D / C** (documented, calculated): build from them.
- **I** (inferred): keep parametric.
- **U** (unresolved): leave out.

## What to build

1. **The datum:** Z = 0 is the top of the foundation = finished grade = tower base (dossier p.1). **Seat Z = 0 on Provincetown's lidar** at the monument (High Pole Hill). ⛔ Don't assume flat ground: read the terrain.
2. **The plinth:** the foundation top, **28' × 28'** at Z = 0 (D). The 60' below-grade mass is omitted (dossier §3).
3. **A placeholder mass at true height:** the stepped shaft from D/C values only.
   - 27' → 25'8" → 24'4" → 23' at the three washes: Z 16'3", 28'11", 39'4".
   - A 23' shaft to the upper transition.
   - The balcony deck, 29'6" square at 204'4".
   - The top at **252'7.5"**.

   Upper-stage I values stay parametric, and are plainly a placeholder for the artist's model, so the hero camera and skyline read at the right scale.
4. **The area around it:** the grounds, terraces and paths as OSM maps them (the monument is OSM `man_made` + `building`, `height` 77, at 1 High Pole Hill Road; the inclined elevator is mapped too). Draw them from the data; don't invent grounds.
5. **The drop-in slot:** a clear contract so the artist's model replaces the placeholder: units, origin at the base centre / Z = 0, orientation, and where the file goes.
   ⭐ The precedent is LS's Gateway Arch (`src/components/GatewayArch.jsx`, `src/lib/heroSubject.js`). ⚠️ Whether the hero-object program belongs in the kit is still Jacob's open ruling (`ROADMAP H-7`: "set-piece" vs "framing subject"). **Build this as Provincetown's set-piece the way LS's Arch is, and say what you'd generalise; don't build a kit framework.**
6. **Its own building footprint** must not also extrude as a plain 77 m box beside the placeholder. The set-piece replaces it; say how.

## Checks

- The set-piece sits on the terrain: base Z within the terrain grid step at its footprint.
- Its top is 252'7.5" above the base.
- Nothing in the D/C table moved (read from one constants table, cited to the dossier).

## Coordination

- The checkout is shared: commit only your own paths.
- Run `node scripts/bake-in-flight.mjs` before saving anything the dev servers import.
- ⛔ No stash, reset, rebase or branch switch.
- Report to Boz, with a picture at the hero camera and at street level.
