"""Fetch NAIP crops (native UTM pixels, all 4 bands) around each site from Planetary Computer.
Site centres come from ramp-ends.json (sites.mjs), never hand-typed."""
import json, sys, numpy as np, rasterio, planetary_computer as pc, pystac_client
from rasterio.windows import from_bounds
from rasterio.warp import transform, transform_bounds
OUT = 'scratch/.naip-spike'
geo = json.load(open('cartograph/data/lafayette-square/geography.json'))
ends = json.load(open('scratch/naip-spike/ramp-ends.json'))
def site(pred):
    pts = [e for e in ends if pred(e)]
    xs = [e['x'] for e in pts]; zs = [e['z'] for e in pts]
    return (min(xs)+max(xs))/2, (min(zs)+max(zs))/2, pts
SITES = {
  'jefferson': site(lambda e: 'South Jefferson Avenue' in e['streets'] or 'Geyer Avenue' in e['streets'] and e['x'] < 0),
  'truman':    site(lambda e: e['x'] > 300 and e['x'] < 650 and 240 < e['z'] < 330),
}
HALF = 190  # m: crop half-size
def ll(x, z): return geo['lon'] + x/geo['lonToMeters'], geo['lat'] - z/geo['latToMeters']
cat = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
ids = sys.argv[1:] or ['mo_m_3809031_nw_15_060_20220618']
meta = {}
for iid in ids:
    item = next(cat.search(collections=['naip'], ids=[iid]).items())
    href = item.assets['image'].href
    with rasterio.open(href) as src:
        for name, (cx, cz, pts) in SITES.items():
            lo0, la0 = ll(cx-HALF, cz+HALF); lo1, la1 = ll(cx+HALF, cz-HALF)
            b = transform_bounds('EPSG:4326', src.crs, lo0, la0, lo1, la1)
            w = from_bounds(*b, src.transform).round_offsets().round_lengths()
            arr = src.read(window=w, boundless=True, fill_value=0)
            prof = src.profile.copy(); prof.update(width=arr.shape[2], height=arr.shape[1], transform=src.window_transform(w), driver='GTiff', compress='deflate')
            fn = f'{OUT}/{name}_{iid}.tif'
            with rasterio.open(fn, 'w', **prof) as dst: dst.write(arr)
            nod = float((arr.max(0) == 0).mean())
            print(f'{iid} {name}: centre frame ({cx:.1f},{cz:.1f}) ll {ll(cx,cz)[1]:.6f},{ll(cx,cz)[0]:.6f} · {arr.shape} · crs {src.crs} · res {src.res} · nodata frac {nod:.3f} · rgb mean {arr[:3].mean():.1f}')
            meta[f'{name}_{iid}'] = dict(file=fn, centre=[cx, cz], gsd=src.res[0], datetime=item.properties['datetime'], nodata=nod)
json.dump(meta, open(f'{OUT}/fetch-meta-{"_".join(i[-8:] for i in ids)}.json', 'w'), indent=1)
