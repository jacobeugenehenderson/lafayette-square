#!/usr/bin/env python3
"""Fetch the NLCD Tree Canopy Cover raster for a scene extent.

NLCD TCC (USDA Forest Service, via the MRLC geoserver) is a 30 m raster of
PERCENT tree canopy per pixel across CONUS — the authoritative "where are the
trees, and how dense" signal. This is the areal complement to the point-based
census (13/14): the census tells us individual managed/mapped trees; TCC tells
us the canopy everywhere else (parks, campuses, private yards) that no point
inventory captures. 17-fill-canopy-trees.mjs scatters the mix into it.

Generalizable per-town (Tier ①): re-point the bbox (geography.json) and re-run —
same as the USGS DEM and the ArcGIS census. Works anywhere in CONUS.

The MRLC WCS advertises CONUS TCC but 404s GetCoverage (a known geoserver bug),
so we use WMS GetMap with format=image/geotiff, which returns the RAW % values
(not a styled image). The layer name carries a deployment-specific suffix
(e.g. `-4`), so we discover the current name from GetCapabilities rather than
hardcoding it.

Scene-aware via CARTOGRAPH_SCENE. Usage:
  CARTOGRAPH_SCENE=hipointe-demun python3 scripts/16-fetch-canopy.py
Output: cartograph/data/<scene>/raw/canopy.tif  (GeoTIFF, % canopy, EPSG:4326)
"""

import os
import re
import sys

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

from config import BBOX, RAW_DIR, SCENE, DEFAULT_SCENE, ensure_dirs

WMS = "https://www.mrlc.gov/geoserver/mrlc_download/wms"
# ~30 m native; request a grid a bit finer than native for clean sampling.
PX_PER_DEG = 6000  # ≈ 18 m/px at this latitude — oversamples 30 m TCC


def discover_tcc_layer():
    """Latest CONUS TCC layer <Name> from WMS GetCapabilities (handles the
    deployment '-N' suffix + picks the newest year)."""
    print("Discovering the current NLCD TCC layer name…")
    r = requests.get(WMS, params={"service": "WMS", "version": "1.3.0",
                                  "request": "GetCapabilities"}, timeout=90)
    r.raise_for_status()
    names = re.findall(r"<Name>(nlcd_tcc_conus_\d{4}_v\d{4}[^<]*)</Name>", r.text, re.I)
    if not names:
        raise RuntimeError("No nlcd_tcc_conus layer found in MRLC WMS capabilities")
    # newest year wins (year is the 3rd underscore token)
    names = sorted(set(names), key=lambda n: n.split("_")[3], reverse=True)
    return names[0]


def main():
    if SCENE == DEFAULT_SCENE:
        print("Targets poured scenes (LS predates the canopy-fill arc).")
        sys.exit(1)
    ensure_dirs()

    layer = discover_tcc_layer()
    lon_span = BBOX["max_lon"] - BBOX["min_lon"]
    lat_span = BBOX["max_lat"] - BBOX["min_lat"]
    width = max(64, round(lon_span * PX_PER_DEG))
    height = max(64, round(lat_span * PX_PER_DEG))

    print(f"Fetching {layer} for {SCENE} ({width}x{height} px)…")
    r = requests.get(WMS, params={
        "service": "WMS", "version": "1.1.1", "request": "GetMap",
        "layers": layer, "srs": "EPSG:4326",
        "bbox": f"{BBOX['min_lon']},{BBOX['min_lat']},{BBOX['max_lon']},{BBOX['max_lat']}",
        "width": width, "height": height, "format": "image/geotiff",
    }, timeout=120)
    r.raise_for_status()
    if r.content[:5] == b"<?xml":
        raise RuntimeError(f"WMS returned an exception, not a raster:\n{r.text[:400]}")

    out = os.path.join(RAW_DIR, "canopy.tif")
    with open(out, "wb") as f:
        f.write(r.content)
    print(f"Wrote {len(r.content)} bytes -> {out}")
    print("Next: node scripts/17-fill-canopy-trees.mjs (CARTOGRAPH_SCENE set)")


if __name__ == "__main__":
    main()
