#!/bin/sh
# Count street_lamp nodes in a ±1.5 km box around each candidate town (Overpass, sequential).
node -e 'const t=require("./towns.json");for(const[k,[la,lo]]of Object.entries(t)){const d=1500/111320,e=1500/(111320*Math.cos(la*Math.PI/180));console.log(k,(la-d).toFixed(5),(lo-e).toFixed(5),(la+d).toFixed(5),(lo+e).toFixed(5))}' | while read k s w n e; do
  q="[out:json][timeout:60];node[\"highway\"=\"street_lamp\"]($s,$w,$n,$e);out count;"
  c=$(curl -s --max-time 90 -A "lafayette-square-kit lamp-sample" --data-urlencode "data=$q" https://overpass-api.de/api/interpreter | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).elements[0].tags.nodes)}catch(e){console.log("ERR "+s.slice(0,80).replace(/\n/g," "))}})')
  echo "$k $c"; sleep 12
done
