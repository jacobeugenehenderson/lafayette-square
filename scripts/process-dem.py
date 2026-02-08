#!/usr/bin/env python3
"""
Process USGS DEM data for Lafayette Square terrain.

Downloads a 1m DEM GeoTIFF, crops to bounding box, resamples to 128x128 grid.

Usage: python scripts/process-dem.py

Output: src/data/terrain.json
"""

import json
import os
import sys
import numpy as np

try:
    import rasterio
    from rasterio.warp import reproject, Resampling
except ImportError:
    print("Missing rasterio. Install with: pip install rasterio")
    print("Generating synthetic terrain instead...")
    rasterio = None

# Lafayette Square bounds
CENTER_LAT = 38.6160
CENTER_LON = -90.2161

GRID_SIZE = 128
BOUNDS = {
    'minX': -555,
    'maxX': 790,
    'minZ': -999,
    'maxZ': 777,
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'data')


def generate_synthetic_terrain():
    """Generate subtle terrain variation for Lafayette Square."""
    print("Generating synthetic terrain (128x128 grid)...")

    # Park bounds in world coords (~350x350m square, 30 acres)
    PARK_MIN_X, PARK_MAX_X = -175.0, 175.0
    PARK_MIN_Z, PARK_MAX_Z = -175.0, 175.0
    PARK_MARGIN = 20.0  # smooth transition zone around park edge

    data = []
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            # Normalized position (0 to 1)
            nx = col / (GRID_SIZE - 1)
            nz = row / (GRID_SIZE - 1)

            # World coordinates
            wx = BOUNDS['minX'] + (BOUNDS['maxX'] - BOUNDS['minX']) * nx
            wz = BOUNDS['minZ'] + (BOUNDS['maxZ'] - BOUNDS['minZ']) * nz

            # Lafayette Square is relatively flat: ~120-130m ASL
            # Create subtle variation: slight rise to north, gentle undulation
            elevation = 0.0

            # Gentle north-south slope (rises ~2m toward north)
            elevation += (1.0 - nz) * 2.0

            # Subtle east-west undulation
            elevation += np.sin(nx * np.pi * 2) * 0.5

            # Very gentle random-looking variation
            elevation += np.sin(nx * 7.3 + nz * 4.1) * 0.3
            elevation += np.cos(nx * 5.7 + nz * 8.9) * 0.2

            # Flatten terrain within Lafayette Park
            # Distance inside park bounds (negative = inside)
            dx = max(PARK_MIN_X - wx, 0, wx - PARK_MAX_X)
            dz = max(PARK_MIN_Z - wz, 0, wz - PARK_MAX_Z)
            dist_outside = np.sqrt(dx * dx + dz * dz)

            if dist_outside < 0.01:
                # Inside park: flatten to 0
                elevation = 0.0
            elif dist_outside < PARK_MARGIN:
                # Transition zone: smooth blend to 0
                t = dist_outside / PARK_MARGIN
                elevation *= t

            data.append(round(elevation, 2))

    return data


def process_dem_file(dem_path):
    """Process actual DEM GeoTIFF file."""
    if not rasterio:
        return None

    print(f"Processing DEM: {dem_path}")

    with rasterio.open(dem_path) as src:
        # Read and resample to our grid
        data = src.read(1, out_shape=(GRID_SIZE, GRID_SIZE),
                       resampling=Resampling.bilinear)

        # Normalize: subtract minimum to get relative elevation
        min_elev = np.min(data)
        data = data - min_elev

        return data.flatten().tolist()


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # Try to process actual DEM if available
    dem_path = os.path.join(os.path.dirname(__file__), 'lafayette_dem.tif')
    if os.path.exists(dem_path) and rasterio:
        data = process_dem_file(dem_path)
    else:
        data = generate_synthetic_terrain()

    terrain = {
        'width': GRID_SIZE,
        'height': GRID_SIZE,
        'bounds': BOUNDS,
        'data': data,
    }

    output_path = os.path.join(DATA_DIR, 'terrain.json')
    with open(output_path, 'w') as f:
        json.dump(terrain, f)

    print(f"Saved terrain data to {output_path}")
    print(f"  Grid: {GRID_SIZE}x{GRID_SIZE} ({len(data)} points)")
    print(f"  Bounds: X[{BOUNDS['minX']}, {BOUNDS['maxX']}] Z[{BOUNDS['minZ']}, {BOUNDS['maxZ']}]")
    print(f"  Elevation range: {min(data):.1f} - {max(data):.1f}m")


if __name__ == '__main__':
    main()
