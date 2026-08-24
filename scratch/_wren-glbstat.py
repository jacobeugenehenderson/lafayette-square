import json,struct,sys
def stat(p):
    with open(p,'rb') as f: d=f.read()
    n=struct.unpack('<I',d[12:16])[0]
    j=json.loads(d[20:20+n])
    acc=j.get('accessors',[]); bt=lt=0; prims=0
    for m in j.get('meshes',[]):
        for pr in m.get('primitives',[]):
            prims+=1
            kind=(pr.get('extras') or {}).get('atlasKind','bark')
            idx=pr.get('indices')
            cnt=acc[idx]['count'] if idx is not None else acc[pr['attributes']['POSITION']]['count']
            if kind=='leaf': lt+=cnt/3
            else: bt+=cnt/3
    print("%-46s prims %2d | bark %7d tris | leaf %7d tris = %6d cards" % ('/'.join(p.split('/')[-3:]),prims,bt,lt,lt/2))
for p in sys.argv[1:]:
    try: stat(p)
    except Exception as e: print(p,'ERR',e)
