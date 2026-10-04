import fs from 'node:fs'; import path from 'node:path'
const ROOT = process.argv[2]; const seen = new Set()
const exts = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']
const res=(f,s)=>{ if(!s.startsWith('.'))return null; const b=path.resolve(path.dirname(f),s); for(const e of exts){const p=b+e; if(fs.existsSync(p)&&fs.statSync(p).isFile())return p} return null }
function walk(f){ if(seen.has(f))return; seen.add(f); const s=fs.readFileSync(f,'utf8'); const re=/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g; let m; while((m=re.exec(s))){const r=res(f,m[1]||m[2]||m[3]); if(r&&/\.(m?js|jsx)$/.test(r))walk(r)} }
walk(path.join(ROOT,'src/components/Town.jsx'))
for (const f of seen) fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{ if(/(looks\/|design\.json|\/textures\/|\/models\/|\/clouds\/|\/basis\/)/.test(l) && !/^\s*(\*|\/\/)/.test(l)) console.log(path.relative(ROOT,f)+':'+(i+1), l.trim().slice(0,140)) })
