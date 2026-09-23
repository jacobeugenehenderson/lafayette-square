# READ-ONLY probe (H-3 design review, 2026-09-23): where does the OSM carriageway line sit in the section?
# Fetches ArcGIS World_Imagery z19 tiles (the app's own aerial source) around a frame point and draws the
# skeleton centrelines over it: gradeSeparated = red, others = yellow; ticks every 10 m. Output PNG → argv[5].
# usage: python h3-aerial-centreline.py <town> <x> <z> <halfSizeM> <out.png>
import json, math, sys, io, subprocess
from PIL import Image, ImageDraw
town, cx, cz, half, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
g = json.load(open(f'cartograph/data/{town}/geography.json'))
# ⛔ Draw the FLATTENED ribbons.json geometry the consumers read — skeleton `points` are BEZIER CONTROL POINTS on any
# chain carrying `segments` (SKELETON §2), and drawing them puts a chord across the grass where the road curves.
import os
rp = 'src/data/ribbons.json' if town == 'lafayette-square' else f'cartograph/data/{town}/clean/ribbons.json'
sk = json.load(open(rp))['streets']
print('geometry from', rp, os.path.getmtime(rp))
Z = 19
def ll(x, z): return g['lon'] + x / g['lonToMeters'], g['lat'] - z / g['latToMeters']
def tilexy(lon, lat):
    n = 2 ** Z; lr = math.radians(lat)
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
x0, y0 = tilexy(*ll(cx - half, cz - half)); x1, y1 = tilexy(*ll(cx + half, cz + half))
tx0, tx1, ty0, ty1 = int(min(x0, x1)), int(max(x0, x1)), int(min(y0, y1)), int(max(y0, y1))
img = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        u = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}'
        img.paste(Image.open(io.BytesIO(subprocess.run(["curl","-sf","--max-time","20",u],capture_output=True,check=True).stdout)).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
def px(x, z):
    a, b = tilexy(*ll(x, z)); return ((a - tx0) * 256, (b - ty0) * 256)
d = ImageDraw.Draw(img)
for s in sk:
    P = [(p['x'], p['z']) if isinstance(p, dict) else tuple(p) for p in s['points']]
    if not any(abs(x - cx) < half * 1.5 and abs(z - cz) < half * 1.5 for x, z in P): continue
    col = (255, 40, 40) if s.get('gradeSeparated') else (255, 230, 0)
    d.line([px(*p) for p in P], fill=col, width=2)
    for p in P: q = px(*p); d.ellipse([q[0]-2, q[1]-2, q[0]+2, q[1]+2], outline=col)
# scale bar 10 m
a = px(cx - half + 5, cz + half - 5); b = px(cx - half + 15, cz + half - 5); d.line([a, b], fill=(255, 255, 255), width=4)
X0, Y0 = px(cx - half, cz - half); X1, Y1 = px(cx + half, cz + half)
img.crop((int(min(X0, X1)), int(min(Y0, Y1)), int(max(X0, X1)), int(max(Y0, Y1)))).save(out)
m_per_px = 2 * half / abs(X1 - X0)
print(out, f'{m_per_px:.3f} m/px')
