"""Score both models against ground whose answer is KNOWN from the frozen pour, then draw the overlays.
Known-paved: highway polygons; street roadway = tile ring − tile iA (centreline→curb). Island candidates: iA of the
terminal-adjacent tiles with 0 MSBF buildings (the probe's rule). Grid: frame metres, 1 m, origin = site bbox (x0,z0)."""
import json, numpy as np
from PIL import Image, ImageDraw
OUT='scratch/.naip-spike'; G=json.load(open(f'{OUT}/geometry.json'))
FL={'2023':'il_m_3809031_nw_15_030_20230818_20231031','2022':'mo_m_3809031_nw_15_060_20220618'}
def mask(polys,x0,z0,n,g=1.0):
    im=Image.new('L',(int(n/g),int(n/g)),0); d=ImageDraw.Draw(im)
    for p in polys:
        if len(p)>=3: d.polygon([((x-x0)/g,(z-z0)/g) for x,z in p],fill=1)
    return np.array(im,bool)
res={'shape':G['shape'],'skeleton':G['skeleton'],'sites':{}}
for s,S in G['sites'].items():
    x0,z0=S['bbox'][:2]; n=512
    hw=mask(S['highway'],x0,z0,n)
    ring=np.zeros((n,n),bool); ia=np.zeros((n,n),bool)
    for t in S['tiles']: ring|=mask([t['ring']],x0,z0,n); ia|=mask(t['iA'][:1],x0,z0,n)
    road=ring&~ia&~hw
    cands=[t for t in S['tiles'] if t['terminal'] and t['buildings']==0]
    blk=np.zeros((n,n),bool)
    for t in S['tiles']:
        if not(t['terminal'] and t['buildings']==0): blk|=mask(t['iA'][:1],x0,z0,n)
    R={}
    for yr,iid in FL.items():
        p=np.load(f'{OUT}/{s}_{iid}_doodle_prob.npy').argmax(-1); rsc=np.load(f'{OUT}/{s}_{iid}_rsc_road.npy')
        paved=(p==4)|(p==5); a=np.load(f'{OUT}/{s}_{iid}_g1.0.npy').astype(float); ndvi=(a[3]-a[0])/(a[3]+a[0]+1e-6)
        def st(m): return dict(px=int(m.sum()), doodle_paved=round(float(paved[m].mean()),3), doodle_barren=round(float((p[m]==3).mean()),3), doodle_road=round(float((p[m]==5).mean()),3), rsc_road=round(float((rsc[m]>0.5).mean()),3), ndvi_med=round(float(np.median(ndvi[m])),3))
        isl=[]
        for t in cands:
            m=mask(t['iA'][:1],x0,z0,n)
            if m.sum()==0: continue
            isl.append(dict(centroid=t['centroid'],lu=t['lu'],**st(m)))
        R[yr]=dict(highway=st(hw),street_roadway=st(road),building_blocks_iA=st(blk),islands=isl)
    res['sites'][s]=R
    # ── overlay (2023, 0.3 m) ──
    iid=FL['2023']; g=0.3; a=np.load(f'{OUT}/{s}_{iid}_g0.3.npy'); rgb=np.moveaxis(a[:3],0,-1)
    p=np.load(f'{OUT}/{s}_{iid}_doodle_prob.npy').argmax(-1); paved=((p==4)|(p==5)).astype(np.uint8)*255
    pm=np.array(Image.fromarray(paved).resize(rgb.shape[1::-1],Image.NEAREST))>0
    rsc=np.array(Image.fromarray((np.load(f'{OUT}/{s}_{iid}_rsc_road.npy')>0.5).astype(np.uint8)*255).resize(rgb.shape[1::-1],Image.NEAREST))>0
    out=rgb.astype(float); out[pm]=out[pm]*0.5+np.array([255,0,200])*0.5; out[rsc]=out[rsc]*0.55+np.array([0,200,255])*0.45
    im=Image.fromarray(out.astype(np.uint8)); d=ImageDraw.Draw(im)
    P=lambda pts:[((x-x0)/g,(z-z0)/g) for x,z in pts]
    for t in S['tiles']:
        if t['iA']: d.line(P(t['iA'][0]+t['iA'][0][:1]),fill=(255,255,255),width=2)
    for h in S['highway']: d.line(P(h+h[:1]),fill=(255,140,0),width=3)
    for k,t in enumerate(cands):
        if t['iA']: d.line(P(t['iA'][0]+t['iA'][0][:1]),fill=(0,255,0),width=5)
        cx,cz=P([t['centroid']])[0]; d.rectangle([cx-4,cz-8,cx+60,cz+8],fill=(0,0,0)); d.text((cx-2,cz-6),f"I{k+1} {t['lu']}",fill=(0,255,0))
    for l in S['osmIslandLines']: d.line(P(l['pts']),fill=(255,255,0),width=5)
    for q in S['terminals']: cx,cz=P([q])[0]; d.ellipse([cx-7,cz-7,cx+7,cz+7],outline=(255,0,0),width=3)
    for i,(c,t) in enumerate([((255,255,255),'white = curb (tile iA edge)'),((255,140,0),'orange = highway polygon'),((0,255,0),'green = derived island candidates (0-bldg terminal iA)'),((255,255,0),'yellow = OSM footway=traffic_island'),((255,0,0),'red ring = at-grade ramp end'),((255,0,200),'magenta fill = Doodleverse paved (imperv. other+road)'),((0,200,255),'cyan fill = ChesapeakeRSC road p>0.5')]):
        d.rectangle([0,i*16,420,i*16+16],fill=(0,0,0)); d.text((4,i*16+2),t,fill=c)
    d.rectangle([0,im.height-18,im.width,im.height],fill=(0,0,0)); d.text((4,im.height-15),f"{s} · NAIP {iid} (2023-08-18, 0.3 m) · shape {G['shape']} · frame x{x0}..{x0+512} z{z0}..{z0+512}, north up",fill=(255,255,255))
    im.save(f'{OUT}/out/overlay_{s}.png')
json.dump(res,open(f'{OUT}/out/scores.json','w'),indent=1)
for s,R in res['sites'].items():
    for yr,r in R.items():
        print(f'\n== {s} {yr}  (doodle paved | doodle barren | doodle road | rsc road | ndvi med)')
        for k in ['highway','street_roadway','building_blocks_iA']: v=r[k]; print(f"  {k:20s} {v['doodle_paved']:.3f} {v['doodle_barren']:.3f} {v['doodle_road']:.3f} {v['rsc_road']:.3f} {v['ndvi_med']:+.2f}  ({v['px']} m²)")
        for i,v in enumerate(r['islands']): print(f"  I{i+1:<2} {v['lu']:13s} ({v['centroid'][0]:7.1f},{v['centroid'][1]:6.1f}) {v['doodle_paved']:.3f} {v['doodle_barren']:.3f} {v['doodle_road']:.3f} {v['rsc_road']:.3f} {v['ndvi_med']:+.2f}  ({v['px']} m²)")
