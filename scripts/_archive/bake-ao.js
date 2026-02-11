/**
 * Fast Ambient Occlusion Baker for Lafayette Square
 *
 * Optimized version that only considers nearby buildings.
 *
 * Usage: node scripts/bake-ao.js
 */

import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

// Load building data
const buildingsData = JSON.parse(readFileSync(join(dataDir, 'buildings.json'), 'utf-8'));

// AO baking parameters
const AO_SAMPLES = 24;
const AO_DISTANCE = 20;
const AO_BIAS = 0.15;
const NEIGHBOR_RADIUS = 50;

// Pre-generate hemisphere samples (cosine weighted)
const hemisphereSamples = [];
for (let i = 0; i < AO_SAMPLES; i++) {
  const u1 = Math.random();
  const u2 = Math.random();
  const r = Math.sqrt(u1);
  const theta = 2 * Math.PI * u2;
  hemisphereSamples.push(new THREE.Vector3(
    r * Math.cos(theta),
    Math.sqrt(1 - u1),
    r * Math.sin(theta)
  ));
}

function alignToNormal(sample, normal) {
  const up = Math.abs(normal.y) < 0.999
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  return new THREE.Vector3(
    sample.x * tangent.x + sample.y * normal.x + sample.z * bitangent.x,
    sample.x * tangent.y + sample.y * normal.y + sample.z * bitangent.y,
    sample.x * tangent.z + sample.y * normal.z + sample.z * bitangent.z
  );
}

function buildBuildingGeometry(building) {
  const footprint = building.footprint;

  if (!footprint || footprint.length < 3) {
    const geo = new THREE.BoxGeometry(building.size[0], building.size[1], building.size[2]);
    geo.translate(building.position[0], building.size[1] / 2, building.position[2]);
    return geo;
  }

  try {
    const shape = new THREE.Shape();
    shape.moveTo(footprint[0][0] - building.position[0], footprint[0][1] - building.position[2]);
    for (let i = 1; i < footprint.length; i++) {
      shape.lineTo(footprint[i][0] - building.position[0], footprint[i][1] - building.position[2]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: building.size[1], bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(building.position[0], 0, building.position[2]);
    return geo;
  } catch (e) {
    const geo = new THREE.BoxGeometry(building.size[0], building.size[1], building.size[2]);
    geo.translate(building.position[0], building.size[1] / 2, building.position[2]);
    return geo;
  }
}

console.log('Building scene geometry...');

const buildingMeshes = new Map();
const buildingPositions = [];

for (const building of buildingsData.buildings) {
  const geo = buildBuildingGeometry(building);
  const mesh = new THREE.Mesh(geo);
  buildingMeshes.set(building.id, { mesh, geo, building });
  buildingPositions.push({
    id: building.id,
    x: building.position[0],
    z: building.position[2]
  });
}

const groundGeo = new THREE.PlaneGeometry(2000, 2000);
groundGeo.rotateX(-Math.PI / 2);
const groundMesh = new THREE.Mesh(groundGeo);

console.log(`Created ${buildingsData.buildings.length} building meshes`);

function findNeighbors(buildingId, x, z) {
  const neighbors = [groundMesh];
  for (const bp of buildingPositions) {
    if (bp.id === buildingId) continue;
    const dx = bp.x - x;
    const dz = bp.z - z;
    if (dx * dx + dz * dz < NEIGHBOR_RADIUS * NEIGHBOR_RADIUS) {
      neighbors.push(buildingMeshes.get(bp.id).mesh);
    }
  }
  return neighbors;
}

const raycaster = new THREE.Raycaster();
raycaster.far = AO_DISTANCE;

console.log('Baking ambient occlusion...');

const aoData = {};
let totalVertices = 0;
let processedBuildings = 0;

for (const building of buildingsData.buildings) {
  const { geo } = buildingMeshes.get(building.id);
  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const vertexCount = positions.count;

  const neighbors = findNeighbors(building.id, building.position[0], building.position[2]);
  const aoValues = new Float32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const pos = new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );

    const normal = new THREE.Vector3(
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i)
    ).normalize();

    const origin = pos.clone().addScaledVector(normal, AO_BIAS);

    let occluded = 0;
    for (const sample of hemisphereSamples) {
      const dir = alignToNormal(sample, normal);
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObjects(neighbors, false);
      if (hits.length > 0) {
        occluded++;
      }
    }

    aoValues[i] = 1 - (occluded / AO_SAMPLES);
  }

  aoData[building.id] = Array.from(aoValues);
  totalVertices += vertexCount;
  processedBuildings++;

  if (processedBuildings % 20 === 0) {
    console.log(`  Processed ${processedBuildings}/${buildingsData.buildings.length} buildings...`);
  }
}

console.log(`Baked AO for ${totalVertices} vertices across ${processedBuildings} buildings`);

const outputPath = join(dataDir, 'building-ao.json');
writeFileSync(outputPath, JSON.stringify(aoData));
console.log(`Saved AO data to ${outputPath}`);
