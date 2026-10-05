/**
 * revetmentMaterial.js — THE DETAIL LIVES IN THE SHADER, NOT IN THE VERTICES.
 *
 * ⭐⭐ THE ARCHITECTURE THIS EXISTS TO TEST (Jacob, 2026-09-21): *"resolution is why
 * I keep bringing up a noise approach."* Individual boulders store their detail in
 * VERTICES — bytes in the slab, fixed at bake, and an LOD chain to maintain. A
 * noise field stores a FUNCTION: it costs the same for 100 m of shore and for
 * huron's whole 26 km, it is identical on every town, and it is evaluated at
 * whatever scale the camera happens to need.
 *
 * ⇒ THE SPLIT:
 *   · the MESH carries the SILHOUETTE — the gathered shell, tessellated only as
 *     finely as the outline against sky demands.
 *   · this MATERIAL carries everything else — block edges, the shadowed gaps
 *     between stones, the crag of the surface — as NORMALS and per-block tone.
 * ⭐ Surface cragginess is a normals problem, not a vertex problem. That sentence
 * is the whole design.
 *
 * ⛔ NOT A NEW PATTERN. This is the shape `src/components/waterMaterial.js`
 * already uses: a stock `MeshStandardMaterial` patched in `onBeforeCompile`, with
 * an idempotency guard and a `customProgramCacheKey`. Both of those are load-
 * bearing and both are copied deliberately — waterMaterial's own comment records
 * the day a double-patch left `VALIDATE_STATUS false` and the lake simply did not
 * draw, with the mesh present and the geometry correct.
 *
 * ⛔ ONE UNIFORM AND IT IS DERIVED, NOT AUTHORED: `uBlock`, the stone size in
 * metres, which the caller reads off the crest height exactly as the geometry
 * does (`d50For` in `revetmentDrape.js`). It has a unit and its stability is
 * physical, which is what separates it from a `CLAUDE.md` Class D constant.
 */

import * as THREE from 'three'

export function makeRevetmentMaterial({ block = 0.75, color = '#8d8b86', waterY = 0, bandH = 1.0 } = {}) {
  const uniforms = {
    uBlock: { value: block },
    uDetail: { value: 1 },      // 0 = shader detail off, for the A/B in the harness
    uWaterY: { value: waterY },
    // ⭐ The wetted band's height, metres. DERIVED from the crest, never authored: a
    // 3 m revetment has a taller wetted zone than a 0.6 m one.
    // ⚠️ SCENE-WIDE HERE, WHICH IS THE HONEST LIMIT OF THIS PROBE. On a shore whose
    // wall height varies (i.e. every real one) the crest belongs per-vertex on the
    // drape and per-instance on the stones — an `aCrest` float, +4 B/vertex, about
    // +17% on the drape's slab bytes. ⛔ NOT BUILT, and not to be hidden: with one
    // value the band sits at one absolute height along the whole shore, which is
    // right for a level lake and wrong the moment the wall changes size.
    uBandH: { value: bandH },
    // ⛔ DIAGNOSTIC, not decoration. 0 = off · 1 = the perturbed shading normal as
    // colour · 2 = dot(perturbed, geometric): green above the geometric horizon, RED
    // below it. ⭐ A shading normal below its own geometric horizon is not a normal —
    // it is lit from behind and reads black with every individual term "in range".
    uDebug: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 })

  mat.onBeforeCompile = (shader) => {
    // ⛔ IDEMPOTENT — the marker is a symbol only this file emits. See the header.
    if (shader.fragmentShader.includes('revWorley')) return
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRevWorld;
        varying vec3 vRevNormalW;`)
      // ⛔ INSTANCING-AWARE, AND IT HAS TO BE: this material is now mounted on the
      // drape AND on the `InstancedMesh` stones. `modelMatrix` alone ignores
      // `instanceMatrix`, so every stone would sample the field at the mesh's origin
      // and 1,300 stones would wear one identical patch of rock.
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 revPos = vec4(transformed, 1.0);
        vec3 revNrm = objectNormal;
        #ifdef USE_INSTANCING
          revPos = instanceMatrix * revPos;
          mat3 revIM = mat3(instanceMatrix);
          revNrm /= vec3(dot(revIM[0], revIM[0]), dot(revIM[1], revIM[1]), dot(revIM[2], revIM[2]));
          revNrm = revIM * revNrm;
        #endif
        vRevWorld = (modelMatrix * revPos).xyz;
        vRevNormalW = normalize(mat3(modelMatrix) * revNrm);`)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uBlock;
        uniform float uDetail;
        uniform float uWaterY;
        uniform float uBandH;
        uniform float uDebug;
        vec3 revBumpedW = vec3(0.0);
        float revHemi = 1.0;
        float revDeriv = 0.0;
        varying vec3 vRevWorld;
        varying vec3 vRevNormalW;

        float revHash(vec3 c) {
          return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }
        // F1 Worley: nearest site distance, its random id, and F2−F1, which is the
        // EDGE detector — small only at a cell boundary, which is exactly where a
        // revetment has a shadowed gap. ⭐ The cell partition IS the block partition.
        vec3 revWorley(vec3 p) {
          vec3 b = floor(p);
          float f1 = 9.0, f2 = 9.0, id = 0.0;
          for (int i = -1; i <= 1; i++)
          for (int j = -1; j <= 1; j++)
          for (int k = -1; k <= 1; k++) {
            vec3 c = b + vec3(float(i), float(j), float(k));
            vec3 s = c + vec3(revHash(c), revHash(c + 11.3), revHash(c + 27.7));
            float d = length(p - s);
            if (d < f1) { f2 = f1; f1 = d; id = revHash(c + 5.1); }
            else if (d < f2) { f2 = d; }
          }
          return vec3(f1, f2 - f1, id);
        }
        float revGrain(vec3 p) {
          float v = 0.0, a = 0.5;
          for (int o = 0; o < 3; o++) {
            vec3 q = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            float n = mix(mix(mix(revHash(q), revHash(q + vec3(1,0,0)), f.x),
                              mix(revHash(q + vec3(0,1,0)), revHash(q + vec3(1,1,0)), f.x), f.y),
                          mix(mix(revHash(q + vec3(0,0,1)), revHash(q + vec3(1,0,1)), f.x),
                              mix(revHash(q + vec3(0,1,1)), revHash(q + vec3(1,1,1)), f.x), f.y), f.z);
            v += a * (n - 0.5); a *= 0.5; p *= 2.13;
          }
          return v;
        }
        // The height field the normal is bumped by, in METRES, so it is the same
        // field the geometry would have used had it been tessellated that finely.
        float revHeight(vec3 wp) {
          vec3 w = revWorley(wp / uBlock);
          float dome = 0.55 - min(0.55, w.x);        // rounds each block
          float step_ = (w.z - 0.5) * 0.5;           // each block sits at its own level
          float crease = -0.9 * (1.0 - smoothstep(0.0, 0.14, w.y));   // the gap between blocks
          return uBlock * (0.55 * dome + step_ * 0.45 + 0.20 * crease)
               + uBlock * 0.06 * revGrain(wp * (3.0 / uBlock));
        }`)
      // Per-block tone + the darkened gap. ⭐ This is the shader's version of the
      // instanced path's per-instance colour, and it is free in the same way.
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uDetail > 0.5) {
          vec3 rw = revWorley(vRevWorld / uBlock);
          float tone = 0.84 + 0.30 * rw.z;                   // per-block, the stone's own colour
          float gap = smoothstep(0.0, 0.16, rw.y);           // 0 in the crack, 1 on the block
          diffuseColor.rgb *= tone * mix(0.55, 1.0, gap);

          // ⭐ WITHIN-STONE VARIATION, in WORLD space. Per-block tone alone still
          // gives every stone one flat colour; this breaks the patch up so nothing
          // tiles and no two neighbours share a pattern.
          diffuseColor.rgb *= 0.88 + 0.24 * (revGrain(vRevWorld * 1.7) + 0.5);

          // ⭐ MINERAL BANDING. The fractured generator's best feature is its big
          // flat faces and they read dead flat; bedding planes are a horizontal
          // stratification, so key it to world Y and show it only where the face is
          // steep enough to expose a section.
          float bed = sin(vRevWorld.y * 7.3 + revGrain(vRevWorld * 0.35) * 6.0);
          float steep = 1.0 - abs(normalize(vRevNormalW).y);
          diffuseColor.rgb *= 1.0 + 0.07 * bed * steep;

          // ⭐⭐ THE WATERLINE, AND IT IS THE FREE ONE. This is a REVETMENT: it stands
          // in the water, and height above the water plane is the same number that
          // sizes the stone. ⛔ A real waterline is a LINE, not a gradient, so the
          // top of the splash zone is a hard-ish edge.
          float hAb = (vRevWorld.y - uWaterY) / max(0.15, uBandH);
          float wet = 1.0 - smoothstep(0.16, 0.30, hAb);     // submerged / constantly wetted
          float splash = (1.0 - smoothstep(0.34, 0.44, hAb)) * (1.0 - wet);
          vec3 wetCol = diffuseColor.rgb * 0.42;             // dark, saturated
          vec3 algae = vec3(0.16, 0.22, 0.12);
          float alg = smoothstep(0.05, 0.22, hAb) * (1.0 - smoothstep(0.26, 0.40, hAb));
          diffuseColor.rgb = mix(diffuseColor.rgb, wetCol, wet);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(wetCol, algae, 0.55), alg * 0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, splash * 0.7);
          // …and bleached the higher and the more sky-facing it is.
          float up = max(0.0, normalize(vRevNormalW).y);
          float dry = smoothstep(0.42, 0.85, hAb);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.15, 1.10), dry * up);
          // ⭐ ORIENTATION: upward faces take lichen and dust; downward and inward
          // faces stay dark, clean and damp. This is most of what stops procedural
          // rock reading as noise — it gives the surface a gravity and a history.
          float lichen = smoothstep(0.55, 0.95, up) * dry * (0.5 + revGrain(vRevWorld * 0.9));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.44, 0.33), clamp(lichen * 0.30, 0.0, 0.35));
          diffuseColor.rgb *= mix(0.78, 1.0, up * 0.5 + 0.5);

          // ⛔⛔ AND THEN CLAMP AGAINST THE BASE, BECAUSE THESE TERMS COMPOUND.
          // MEASURED: the gap darkening, the grain, the wet band, the splash zone and
          // the orientation term are each reasonable alone and are applied in series,
          // so a stone low on the wall and facing away collects all five and lands
          // near black — the wall read as a silhouette with every individual term
          // correct. ⭐ A stack of multiplicative shadings needs one floor at the end;
          // it is not a taste setting, it is the difference between a material and a
          // product of five materials.
          vec3 revBase = vec3(1.0);
          #ifdef USE_COLOR
            revBase = vColor;
          #endif
          float revLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float revFloor = 0.16;
          if (revLum < revFloor) diffuseColor.rgb *= revFloor / max(revLum, 1e-4);
          diffuseColor.rgb = min(diffuseColor.rgb, vec3(1.0));
        }`)
      // ⭐⭐ ROUGHNESS ON ITS OWN FREQUENCY BAND. ⛔ It must NOT restate the normal
      // detail's wavelengths — that is the same mistake as setting `uBlock` to the
      // stone size (the bug this file already carries a receipt for), in another
      // channel: two maps at one frequency flatten each other. Roughness is finer and
      // patchier than the bump, and the strongest single cue is WET STONE IS GLOSSY —
      // that is what says "water's edge" rather than "wall in a field".
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (uDetail > 0.5) {
          // ⛔⛔ THIS LOCAL WAS ONCE NAMED WITH A GLSL RESERVED WORD (the one meaning
          // a tessellation patch) AND THAT KILLED THE WHOLE MATERIAL. It is RESERVED, so the fragment shader did not compile,
          // so the program never linked, so every surface using this material drew
          // BLACK — at every camera, across whole faces, immune to the albedo floor,
          // the gradient clamp and the shadow config, because none of that code was
          // ever running. ⭐ I then spent hours reasoning about what the shader
          // COMPUTED without establishing that the shader EXISTED, and chased three
          // innocent suspects (the tangential gather, the edge trim, crest flaps).
          // ⇒ FOURTH instance tonight of ONE class, all in this file: a reserved
          // gl_ prefix · a stray backtick ending the JS template literal early · this
          // · and then a FIFTH, when the comment recording them used backticks and
          // took the module out again. ⛔ NO BACKTICKS IN GLSL COMMENTS, and ⛔ BLANK
          // OR BLACK SURFACE: READ THE PROGRAM
          // LOG FIRST. It is printed to the console and needs no frame, which also
          // makes it the only diagnostic that survives an unfocused tab.
          float rPatch = revGrain(vRevWorld * (2.9 / uBlock)) + 0.5;     // its own band, ~3× finer
          roughnessFactor *= mix(0.86, 1.06, rPatch);
          float hAbR = (vRevWorld.y - uWaterY) / max(0.15, uBandH);
          float wetR = 1.0 - smoothstep(0.16, 0.32, hAbR);
          roughnessFactor = mix(roughnessFactor, 0.18, wetR * 0.85);    // glossy when wet
          roughnessFactor = clamp(roughnessFactor, 0.06, 1.0);
        }`)

      // ⭐⭐ BUMP FROM SCREEN-SPACE DERIVATIVES OF A PROCEDURAL HEIGHT. No tangents,
      // no UVs, no texture — it works on an arbitrary unparameterised surface,
      // which is what a draped strip is. (Mikkelsen's surface-gradient form.)
      // ⛔ It perturbs the SHADING normal only: the silhouette is still the mesh's,
      // which is precisely why the mesh still has to carry the outline.
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if (uDebug > 0.5) {
          if (uDebug < 1.5) gl_FragColor = vec4(revBumpedW * 0.5 + 0.5, 1.0);
          else if (uDebug < 2.5) gl_FragColor = vec4(revHemi < 0.0 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, revHemi, 0.0), 1.0);
          else gl_FragColor = vec4(vec3(clamp(revDeriv * 2.0, 0.0, 1.0)), 1.0);
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (uDetail > 0.5) {
          float hgt = revHeight(vRevWorld);
          vec3 dpx = dFdx(vRevWorld), dpy = dFdy(vRevWorld);
          float dhx = dFdx(hgt), dhy = dFdy(hgt);
          vec3 nw = normalize(vRevNormalW);
          vec3 r1 = cross(dpy, nw), r2 = cross(nw, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          // ⛔ CLAMP THE SURFACE GRADIENT, AND THIS WAS A MEASURED FAILURE, NOT A
          // PRECAUTION. The block-edge term is nearly a STEP, so at close range the
          // screen-space derivative of the height is effectively unbounded, the
          // perturbed normal points anywhere, and the wall renders BLACK with
          // metre-long shading fins. Capping the gradient at a fixed slope keeps
          // the crease sharp while keeping the normal a normal.
          // ⛔ NAME RECEIPT: this local was once called gl_ ... and GLSL RESERVES
          // the gl_ prefix, so the fragment shader failed to compile, the program
          // never linked, and the drape drew BLACK — with correct geometry, correct
          // normals and no clue on screen. VALIDATE_STATUS false again, exactly as
          // waterMaterial.js warns. (And this comment itself then broke the JS: a
          // backtick inside a template literal ends the string. No backticks in
          // GLSL comments.) Blank or black surface: CHECK THE SHADER COMPILE FIRST.
          float maxg = abs(det) * 2.2;
          float gLen = length(grad);
          if (gLen > maxg) grad *= maxg / max(gLen, 1e-6);
          vec3 bumped = normalize(abs(det) * nw - grad);
          revBumpedW = bumped;
          revHemi = dot(bumped, nw);
          revDeriv = length(dpx) + length(dpy);
          normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);
          nonPerturbedNormal = normal;
        }`)
  }
  // ⭐ One key for every revetment in the kit: the per-town difference is uBlock,
  // a uniform, so the program is identical and sharing it is the point.
  mat.onBeforeCompile.__dbg = true
  mat.customProgramCacheKey = () => 'kit-revetment-v1'

  return { material: mat, uniforms }
}
