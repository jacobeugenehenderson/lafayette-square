"""Warp NAIP into the kit's frame grid: pixel (col,row) ↔ frame (x0+col*g, z0+row*g), +x=E, +z=S.
The frame is geography.json's local plane: x=(lon-lon0)*lonToMeters, z=-(lat-lat0)*latToMeters, so a
EPSG:4326 grid with dlon=g/lonToMeters, dlat=g/latToMeters IS the frame grid, north-up (row ↑ = z ↑ = south)."""
import json, sys, numpy as np, rasterio, planetary_computer as pc, pystac_client
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine
OUT = 'scratch/.naip-spike'
geo = json.load(open('cartograph/data/lafayette-square/geography.json'))
sites = json.load(open('scratch/naip-spike/sites.json'))
cat = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
for iid in sys.argv[1:]:
    item = next(cat.search(collections=['naip'], ids=[iid]).items())
    with rasterio.open(item.assets['image'].href) as src:
        for name, S in sites.items():
            x0, z0, x1, z1 = S['bbox']
            for g in (1.0, 0.3):
                W = int(round((x1 - x0) / g)); H = int(round((z1 - z0) / g))
                dst_t = Affine(g / geo['lonToMeters'], 0, geo['lon'] + x0 / geo['lonToMeters'], 0, -g / geo['latToMeters'], geo['lat'] - z0 / geo['latToMeters'])
                arr = np.zeros((4, H, W), np.uint8)
                reproject(rasterio.band(src, [1, 2, 3, 4]), arr, dst_transform=dst_t, dst_crs='EPSG:4326', resampling=Resampling.average if g >= src.res[0] else Resampling.bilinear)
                np.save(f'{OUT}/{name}_{iid}_g{g}.npy', arr)
                print(iid, name, g, arr.shape, 'nodata', float((arr.max(0) == 0).mean()))
