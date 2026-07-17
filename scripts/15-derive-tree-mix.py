#!/usr/bin/env python3
"""Derive a geography's tree species MIX from the City census, collapse it to
the renderable library palette, and drape it over the speciesless placements.

The model (Jacob, 2026-07-05): we don't need per-tree species truth everywhere.
We determine a believable MIX for the geography (empirically, from the City
Forestry inventory — a real species distribution for exactly this place), collapse
it to the ~18 library species we can actually render, and distribute that mix
over whatever placement points we can find:
  - City points keep their REAL species (honor real), mapped to the library.
  - OSM / speciesless points are MIX-SAMPLED (weighted by the empirical
    distribution, deterministic by position — stable across bakes).

Produces (for CARTOGRAPH_SCENE):
  cartograph/data/<scene>/tree-mix.json        — the mix (COMMON weights + collapse map + palette)
  cartograph/data/<scene>/tree-species-map.json — {COMMON: [libraryId]} for bake-trees --species-map
  public/looks/<scene>/design.json #/trees      — the roster (palette variants) bake-look packs
  cartograph/data/<scene>/clean/osm_trees.json  — re-draped: speciesless points get mix-sampled COMMON

Downstream unchanged: bake-look (atlas from roster) -> bake-trees (routes census
COMMON -> palette via the species map) -> runtime. City COMMON we don't map fall
to the keyword collapse below, so honor-real coverage is near-total.

Usage: CARTOGRAPH_SCENE=hipointe-demun python3 scripts/15-derive-tree-mix.py
"""

import json
import os
import sys
from collections import Counter

from config import SCENE_RAW_DIR, SCENE_CLEAN_DIR, PROJECT_DIR, SCENE

PALETTE_TARGET = 18  # soft cap on distinct library species in the roster

# ── COMMON-name -> library canonical id (the Tier-③ collapse) ───────────────
# Exact overrides for the top of the empirical distribution; everything else
# falls to keyword_collapse() so honor-real coverage is near-total. Library
# ids are from public/trees/index.json. Gaps (Callery Pear, Redbud, Ginkgo,
# Sweetgum, Tuliptree, Bald Cypress…) lean on the nearest renderable cousin.
EXACT = {
    "Maple, Red": "maple_red", "Maple, Red 'October Glory'": "maple_red",
    "Maple, Freeman": "maple_red", "Maple, Sugar": "maple_sugar",
    "Maple, Norway": "maple_sugar", "Maple, Silver": "maple_silver",
    "Maple, Silver (restricted use)": "maple_silver", "Maple, Hedge": "maple_red",
    "Pear, Callery": "procedural_ornamental", "Redbud": "procedural_ornamental",
    "Redbud, Eastern": "procedural_ornamental", "Cherry/Plum, spp.": "procedural_ornamental",
    "Crabapple, Flowering": "procedural_ornamental", "Dogwood, Flowering": "procedural_ornamental",
    "Lilac, Japanese Tree 'Ivory Silk'": "procedural_ornamental", "serviceberry, spp.": "procedural_ornamental",
    "Oak, Pin": "quercus_alba", "Oak, Pin (restricted use)": "quercus_alba",
    "oak, northern red": "quercus_alba", "Oak, Northern Red": "quercus_alba",
    "Oak, Sawtooth": "quercus_alba", "Oak, English": "quercus_alba",
    "Oak, English 'Fastigiata'": "procedural_columnar", "Oak, Swamp White": "oak_white",
    "Blackgum": "blackgum", "Planetree, London": "platanus_acerifolia",
    "sycamore, American": "platanus_acerifolia", "Sycamore American (restricted use)": "platanus_acerifolia",
    "Ginkgo": "procedural_columnar", "Ginkgo 'Princeton Sentry'": "procedural_columnar",
    "Linden, Littleleaf": "linden_american", "Sweetgum (undesirable)": "generic_tree_2",
    "Tuliptree": "generic_tree_2", "Elm, Frontier": "generic_tree_2", "Elm, Hybrid": "generic_tree_2",
    "Ash, White": "ash_green", "Ash, Green": "ash_green",
    "honeylocust, thornless": "garden_mix", "Kentucky Coffeetree": "generic_tree_2",
    "Coffeetree, Kentucky": "generic_tree_2", "Birch": "birch", "Hackberry": "generic_tree_2",
    "Cypress, Bald": "procedural_conifer", "redcedar, eastern": "procedural_conifer",
    "Zelkova, Japanese": "generic_tree_2", "Zelkova, 'Village Green'": "generic_tree_2",
}


def keyword_collapse(common):
    c = common.lower()
    if "ginkgo" in c: return "procedural_columnar"
    if any(k in c for k in ("fastigiat", "sentry", "columnar", "sky")): return "procedural_columnar"
    if any(k in c for k in ("pear", "redbud", "crab", "cherry", "plum", "dogwood",
                            "serviceberry", "lilac", "magnolia", "hawthorn", "smoke",
                            "flowering")): return "procedural_ornamental"
    if any(k in c for k in ("pine", "spruce", "fir", "cedar", "cypress", "juniper",
                            "arborvitae", "hemlock", "conifer", "evergreen")): return "procedural_conifer"
    if "willow" in c: return "procedural_weeping"
    if "birch" in c: return "birch"
    if "maple" in c:
        if "sugar" in c or "norway" in c: return "maple_sugar"
        if "silver" in c: return "maple_silver"
        return "maple_red"
    if "oak" in c:
        if "swamp white" in c or ("white" in c and "swamp" in c): return "oak_white"
        if "bur" in c: return "oak_bur"
        if "white" in c: return "oak_white"
        return "quercus_alba"
    if "ash" in c: return "ash_green"
    if "linden" in c or "basswood" in c: return "linden_american"
    if any(k in c for k in ("planetree", "sycamore", "plane")): return "platanus_acerifolia"
    if any(k in c for k in ("blackgum", "black gum", "tupelo")): return "blackgum"
    if "honeylocust" in c or "honey locust" in c: return "garden_mix"
    return "generic_tree_2"  # broad default cousin


def map_common(common):
    return EXACT.get(common) or keyword_collapse(common)


def det_hash(x, z, salt=0):
    """Deterministic 32-bit hash of a placement position (stable across bakes)."""
    xi = int(round(x * 1000)); zi = int(round(z * 1000))
    h = (xi ^ (zi * 73856093) ^ (salt * 19349663)) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) * 2246822507 & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 3266489909 & 0xFFFFFFFF
    return (h ^ (h >> 16)) & 0xFFFFFFFF


def weighted_pick(u01, items):
    """items: list of (label, weight). u01 in [0,1) -> label by cumulative weight."""
    total = sum(w for _, w in items)
    target = u01 * total
    acc = 0.0
    for label, w in items:
        acc += w
        if target < acc:
            return label
    return items[-1][0]


def main():
    scene_dir = os.path.join(PROJECT_DIR, "cartograph", "data", SCENE)
    raw_path = os.path.join(SCENE_RAW_DIR, "city_trees_raw.json")
    if not os.path.exists(raw_path):
        print(f"No City census at {raw_path}; run scripts/13-fetch-city-trees.py first.")
        sys.exit(1)

    # ── 1. Empirical COMMON distribution (live trees) ───────────────────────
    with open(raw_path) as f:
        feats = json.load(f).get("features", [])
    common_counts = Counter()
    for feat in feats:
        a = feat.get("attributes", {})
        if (a.get("CONDITION") or "").strip() in ("Dead", "Stump"):
            continue
        common_counts[(a.get("COMMON") or "Unknown").strip()] += 1
    live = sum(common_counts.values())
    print(f"City census: {live} live trees, {len(common_counts)} distinct species")

    # ── 2. Collapse to library palette + aggregate weights ──────────────────
    lib_weight = Counter()
    common_to_lib = {}
    for common, n in common_counts.items():
        lib = map_common(common)
        common_to_lib[common] = lib
        lib_weight[lib] += n
    palette = [lib for lib, _ in lib_weight.most_common(PALETTE_TARGET)]
    palette_set = set(palette)
    covered = sum(lib_weight[l] for l in palette)
    print(f"Palette: {len(palette)} library species covering "
          f"{100*covered/live:.0f}% of the canopy")
    for lib in palette:
        print(f"  {100*lib_weight[lib]/live:5.1f}%  {lib}")

    # Fold any out-of-palette collapse target into the nearest in-palette one
    # (keeps the roster == palette and every COMMON routed into it).
    def to_palette(lib):
        if lib in palette_set: return lib
        # same-category demotion: procedural_* and generics fall to generic_tree_2;
        # everything else to the heaviest broadleaf in the palette.
        return "generic_tree_2" if "generic_tree_2" in palette_set else palette[0]
    for common in list(common_to_lib):
        common_to_lib[common] = to_palette(common_to_lib[common])

    # ── 3. Roster (design.json#/trees) — palette variants from the index ────
    index = json.load(open(os.path.join(PROJECT_DIR, "public", "trees", "index.json")))
    variants_by_species = {}
    for v in index["variants"]:
        variants_by_species.setdefault(v["species"], []).append(v)
    roster = []
    for lib in palette:
        vs = variants_by_species.get(lib, [])
        if not vs:
            print(f"  ⚠ no variants in index for '{lib}' — skipping in roster")
            continue
        for v in vs:
            roster.append({"species": lib, "variantId": v["variantId"]})
    design_path = os.path.join(PROJECT_DIR, "public", "looks", SCENE, "design.json")
    design = json.load(open(design_path))
    design["trees"] = roster
    with open(design_path, "w") as f:
        json.dump(design, f, indent=2)
    print(f"Roster -> {design_path} ({len(roster)} variants across {len(palette)} species)")

    # ── 4. Species map (COMMON -> [libraryId]) for bake-trees --species-map ──
    species_map = {"map": {c: [lib] for c, lib in common_to_lib.items()}}
    map_path = os.path.join(scene_dir, "tree-species-map.json")
    with open(map_path, "w") as f:
        json.dump(species_map, f, indent=2)
    print(f"Species map -> {map_path} ({len(common_to_lib)} COMMON names routed)")

    # ── 5. tree-mix.json (the mix, documented) ──────────────────────────────
    mix = {
        "source": "City of St. Louis Forestry Division (empirical), collapsed to library palette",
        "scene": SCENE,
        "liveTrees": live,
        "palette": [{"libraryId": l, "share": round(lib_weight[l] / live, 4)} for l in palette],
        "commonToLibrary": common_to_lib,
        # Full empirical COMMON->count distribution. Both the OSM drape (above)
        # and the canopy fill (17-fill-canopy-trees.mjs) sample THIS so every
        # speciesless placement draws from one identical mix.
        "commonWeights": dict(common_counts),
    }
    mix_path = os.path.join(scene_dir, "tree-mix.json")
    with open(mix_path, "w") as f:
        json.dump(mix, f, indent=2)
    print(f"Mix -> {mix_path}")

    # ── 6. Drape the mix over speciesless points (OSM County side) ──────────
    # Sample the empirical COMMON distribution, deterministic by position, so
    # the DeMun side reads with the same proportions as the real Hi-Pointe data.
    osm_path = os.path.join(SCENE_CLEAN_DIR, "osm_trees.json")
    if os.path.exists(osm_path):
        osm = json.load(open(osm_path))
        mix_common = common_counts.most_common()  # (COMMON, count), weighted
        for t in osm["trees"]:
            u = det_hash(t["x"], t["z"]) / 0xFFFFFFFF
            t["species"] = weighted_pick(u, mix_common)
        osm["meta"]["draped"] = "mix-sampled from City empirical distribution (deterministic by position)"
        with open(osm_path, "w") as f:
            json.dump(osm, f, separators=(",", ":"))
        print(f"Draped {len(osm['trees'])} OSM points -> {osm_path}")
        top = Counter(t["species"] for t in osm["trees"]).most_common(5)
        print("  OSM top draped species: " + ", ".join(f"{s} ({n})" for s, n in top))
    else:
        print(f"(no {osm_path} to drape)")


if __name__ == "__main__":
    main()
