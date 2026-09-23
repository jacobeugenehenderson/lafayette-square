"""Axis/orientation check: skeleton centrelines (frame → lat/lon → tile UTM) drawn on each NAIP crop.
If +z were north (mirrored), the ramps would land off the pavement."""
import json, sys, numpy as np, rasterio
from rasterio.warp import transform
from PIL import Image, ImageDraw
OUT='scratch/.naip-spike'
geo=json.load(open('cartograph/data/lafayette-square/geography.json'))
sk=json.load(open('cartograph/data/lafayette-square/clean/skeleton.json'))
def to_px(src, pts, flip=1):
    lon=[geo['lon']+p['x']/geo['lonToMeters'] for p in pts]; lat=[geo['lat']-flip*p['z']/geo['latToMeters'] for p in pts]
    X,Y=transform('EPSG:4326',src.crs,lon,lat); inv=~src.transform
    return [inv*(x,y) for x,y in zip(X,Y)]
tiles=sys.argv[1:]
for site in ['jefferson','truman']:
    panels=[]
    for t in tiles:
        with rasterio.open(f'{OUT}/{site}_{t}.tif') as src:
            rgb=np.moveaxis(src.read([1,2,3]),0,-1); im=Image.fromarray(rgb).convert('RGB')
            s=650/im.width; im=im.resize((650,int(im.height*s))); d=ImageDraw.Draw(im)
            for flip,col in [(1,(255,0,255)),(-1,(0,255,255))] if t==tiles[0] else [(1,(255,0,255))]:
                for st in sk['streets']:
                    px=[(u*s,v*s) for u,v in to_px(src,st['points'],flip)]
                    d.line(px,fill=col,width=2)
            d.rectangle([0,0,650,18],fill=(0,0,0)); d.text((4,3),f'{site} {t}  magenta=+z South (correct) cyan=+z North (mirror)' if t==tiles[0] else f'{site} {t}',fill=(255,255,255))
            panels.append(im)
    W=sum(p.width for p in panels); H=max(p.height for p in panels); out=Image.new('RGB',(W,H))
    x=0
    for p in panels: out.paste(p,(x,0)); x+=p.width
    out.save(f'{OUT}/out/axischeck_{site}.png'); print(f'{OUT}/out/axischeck_{site}.png')
