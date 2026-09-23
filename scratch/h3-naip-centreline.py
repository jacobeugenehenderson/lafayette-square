# READ-ONLY probe (H-3, 2026-09-23): where does the OSM carriageway line sit in the section — measured on NAIP
# (registry `naip`, PERMITTED, public domain). Replaces the ArcGIS-based h3-aerial-centreline.py as the measurement
# input (Esri terms unchecked). Draws the FLATTENED ribbons.json centrelines (gradeSeparated red, others yellow) over
# the most recent NAIP flight covering the site, reprojected onto the kit frame grid (the warp.py construction:
# x=(lon-lon0)*lonToMeters, z=-(lat-lat0)*latToMeters, row ↓ = z ↑ = south). Prints the NAIP item id + flight date.
# usage: <albedo venv>/bin/python scratch/h3-naip-centreline.py <town> <x> <z> <halfM> <out.png>
import json, sys, numpy as np, rasterio, planetary_computer as pc, pystac_client
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine
from PIL import Image, ImageDraw
town, cx, cz, half, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
geo = json.load(open(f'cartograph/data/{town}/geography.json'))
rp = 'src/data/ribbons.json' if town == 'lafayette-square' else f'cartograph/data/{town}/clean/ribbons.json'
streets = json.load(open(rp))['streets']
def ll(x, z): return geo['lon'] + x / geo['lonToMeters'], geo['lat'] - z / geo['latToMeters']
lo0, la1 = ll(cx - half, cz - half); lo1, la0 = ll(cx + half, cz + half)
cat = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
lon_c, lat_c = ll(cx, cz)
items = [it for it in cat.search(collections=['naip'], intersects={'type': 'Point', 'coordinates': [lon_c, lat_c]}).items()]
if not items: sys.exit(f'⛔ no NAIP item covers {town} ({cx},{cz})')
item = max(items, key=lambda it: it.properties['datetime'])
g = 0.3
W = H = int(round(2 * half / g))
dst_t = Affine(g / geo['lonToMeters'], 0, geo['lon'] + (cx - half) / geo['lonToMeters'], 0, -g / geo['latToMeters'], geo['lat'] - (cz - half) / geo['latToMeters'])
arr = np.zeros((3, H, W), np.uint8)
with rasterio.open(item.assets['image'].href) as src:
    reproject(rasterio.band(src, [1, 2, 3]), arr, dst_transform=dst_t, dst_crs='EPSG:4326', resampling=Resampling.bilinear)
    gsd = src.res[0]
img = Image.fromarray(np.moveaxis(arr, 0, 2)); d = ImageDraw.Draw(img)
px = lambda x, z: ((x - (cx - half)) / g, (z - (cz - half)) / g)
for s in streets:
    P = [tuple(p) if isinstance(p, list) else (p['x'], p['z']) for p in s['points']]
    if not any(abs(x - cx) < half * 1.5 and abs(z - cz) < half * 1.5 for x, z in P): continue
    col = (255, 40, 40) if s.get('gradeSeparated') else (255, 230, 0)
    d.line([px(*p) for p in P], fill=col, width=2)
d.line([px(cx - half + 5, cz + half - 5), px(cx - half + 15, cz + half - 5)], fill=(255, 255, 255), width=4)  # 10 m bar
img.save(out)
print(f'{out} · NAIP {item.id} · flight {item.properties["datetime"]} · native gsd {gsd} m · drawn at {g} m/px · geometry {rp}')
