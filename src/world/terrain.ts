import { ISLAND_RADIUS, LANDMARKS } from '../types/game';

// Deterministic pseudo-random helper
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes the stylized island terrain height at world (x, z).
 */
export function getTerrainHeight(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // Island falloff into ocean
  const islandMask = 1 - smoothstep(ISLAND_RADIUS * 0.72, ISLAND_RADIUS, distFromCenter);
  if (islandMask <= 0.001) {
    return -5.5;
  }

  // Rolling hills using layered sine waves
  let h =
    Math.sin(x * 0.035) * Math.cos(z * 0.035) * 3.2 +
    Math.sin(x * 0.08 + 1.2) * Math.sin(z * 0.07 + 0.5) * 1.3 +
    Math.cos((x + z) * 0.022) * 2.0 +
    1.8;

  // Flatten Starting Plaza (0, 0)
  const plazaDist = Math.hypot(x - 0, z - 0);
  const plazaFlatten = 1 - smoothstep(8, 22, plazaDist);
  h = h * (1 - plazaFlatten) + 1.5 * plazaFlatten;

  // Flatten Ancient Ruins plateau (-54, -46)
  const ruinsDist = Math.hypot(x - -54, z - -46);
  const ruinsFlatten = 1 - smoothstep(10, 24, ruinsDist);
  h = h * (1 - ruinsFlatten) + 4.2 * ruinsFlatten;

  // Elevate Crystal Peak mountain (58, -50)
  const peakDist = Math.hypot(x - 58, z - -50);
  const peakBoost = (1 - smoothstep(0, 34, peakDist)) * 22.0;
  const peakPlateau = 1 - smoothstep(3, 9, peakDist);
  h += peakBoost;
  h = h * (1 - peakPlateau * 0.6) + 23.5 * (peakPlateau * 0.6);

  // Flatten Forest Shrine clearing (0, 64)
  const shrineDist = Math.hypot(x - 0, z - 64);
  const shrineFlatten = 1 - smoothstep(9, 22, shrineDist);
  h = h * (1 - shrineFlatten) + 2.6 * shrineFlatten;

  // Combine with island falloff
  const baseCoast = -4.5;
  return baseCoast + (h - baseCoast) * islandMask;
}

/**
 * Returns the walkable ground height at world (x, z), accounting for
 * raised landmark platforms (Starting Plaza dais, Ancient Ruins floor, Forest Shrine platform).
 */
export function getGroundHeight(x: number, z: number): number {
  let y = getTerrainHeight(x, z);

  // Starting Plaza (0, 0): outer dais (r<=9.5..10.5, top +0.45) & inner dais (r<=6.2..6.5, top +0.56)
  const plazaDist = Math.hypot(x, z);
  if (plazaDist <= 6.35) {
    y = Math.max(y, getTerrainHeight(0, 0) + 0.56);
  } else if (plazaDist <= 10.0) {
    y = Math.max(y, getTerrainHeight(0, 0) + 0.45);
  }

  // Ancient Ruins (-54, -46): octagonal stone floor (r<=11.5, top +0.35)
  const ruinsDist = Math.hypot(x + 54, z + 46);
  if (ruinsDist <= 11.5) {
    y = Math.max(y, getTerrainHeight(-54, -46) + 0.35);
  }

  // Forest Shrine (0, 64): stone platform (r<=8.85, top +0.36)
  const shrineDist = Math.hypot(x, z - 64);
  if (shrineDist <= 8.85) {
    y = Math.max(y, getTerrainHeight(0, 64) + 0.36);
  }

  return y;
}

/**
 * Returns [r, g, b] in 0..1 range for terrain vertex coloring.
 */
function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Returns [r, g, b] in 0..1 range for smooth, natural terrain biome tinting.
 * Designed to multiply cleanly with tiled PBR ground textures without harsh boundaries.
 */
export function getTerrainColor(x: number, z: number, y: number): [number, number, number] {
  const n =
    Math.sin(x * 0.08 + z * 0.05) * 0.06 +
    Math.sin(x * 0.19 - z * 0.15) * 0.035;

  // Base lush meadow grass tint
  let col: [number, number, number] = [0.68 + n, 0.88 + n * 0.8, 0.52 + n * 0.4];

  // Forest Shrine deeper emerald moss tint
  const shrineDist = Math.hypot(x, z - 64);
  const shrineBlend = 1 - smoothstep(10, 30, shrineDist);
  col = mixColor(col, [0.48 + n, 0.76 + n * 0.6, 0.48], shrineBlend);

  // Sandy coastline transition
  const sandBlend = 1 - smoothstep(-1.1, 0.55, y + n * 3.0);
  col = mixColor(col, [0.96, 0.9, 0.72], sandBlend);

  // Mountain rock & Crystal Peak frost
  const rockBlend = smoothstep(7.5, 13.5, y + n * 4.0);
  col = mixColor(col, [0.72, 0.74, 0.78], rockBlend);
  const frostBlend = smoothstep(15.0, 20.5, y + n * 3.0);
  col = mixColor(col, [0.92, 0.96, 1.0], frostBlend);

  // Starting Plaza warm stone pathway blend
  const plazaDist = Math.hypot(x, z);
  const plazaBlend = 1 - smoothstep(9.5, 16.5, plazaDist);
  col = mixColor(col, [0.92, 0.89, 0.83], plazaBlend);

  // Ancient Ruins weathered stone blend
  const ruinsDist = Math.hypot(x + 54, z + 46);
  const ruinsBlend = 1 - smoothstep(10.5, 19.0, ruinsDist);
  col = mixColor(col, [0.74, 0.77, 0.68], ruinsBlend);

  return col;
}


export function isNearLandmark(x: number, z: number, extraPadding = 4): boolean {
  for (const lm of LANDMARKS) {
    if (Math.hypot(x - lm.x, z - lm.z) < lm.radius + extraPadding) {
      return true;
    }
  }
  return false;
}

export interface PropPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
}

export interface WorldPropsData {
  trees: PropPlacement[];
  bushes: PropPlacement[];
  grassTufts: PropPlacement[];
  flowers: PropPlacement[];
  plants: PropPlacement[];
  fallenLogs: PropPlacement[];
  rocks: PropPlacement[];
}

export function generateWorldProps(): WorldPropsData {
  const rand = seededRandom(42077);
  const trees: PropPlacement[] = [];
  const bushes: PropPlacement[] = [];
  const grassTufts: PropPlacement[] = [];
  const flowers: PropPlacement[] = [];
  const plants: PropPlacement[] = [];
  const fallenLogs: PropPlacement[] = [];
  const rocks: PropPlacement[] = [];

  // Place varied fantasy trees (avoiding landmarks & steep peak summit)
  for (let i = 0; i < 320 && trees.length < 115; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 15 + rand() * (ISLAND_RADIUS * 0.74);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (isNearLandmark(x, z, 3.5)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.25 || y > 13.5) continue;

    // Higher elevation favors pines; lower/lush areas mix broadleaf, birch, and willow
    const variant =
      y > 7.5
        ? 2
        : Math.floor(rand() * 4); // 0: CommonTree_1, 1: CommonTree_2, 2: PineTree_1, 3: BirchTree_1

    trees.push({
      x,
      y,
      z,
      scale: 0.9 + rand() * 0.75,
      rotation: rand() * Math.PI * 2,
      variant,
    });
  }

  // Dense lush ring around Forest Shrine (including willows & broadleafs)
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (rand() - 0.5) * 0.18;
    const radius = 15.5 + rand() * 16;
    const x = Math.cos(angle) * radius;
    const z = 64 + Math.sin(angle) * radius;
    const y = getTerrainHeight(x, z);
    if (y < 0.2) continue;

    trees.push({
      x,
      y,
      z,
      scale: 1.0 + rand() * 0.7,
      rotation: rand() * Math.PI * 2,
      variant: rand() > 0.65 ? 4 : Math.floor(rand() * 2), // 4: Willow_1
    });
  }

  // Bushes & berry shrubs near forest edges, paths, and Starting Plaza perimeter
  for (let i = 0; i < 220 && bushes.length < 110; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 11.5 + rand() * (ISLAND_RADIUS * 0.72);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearLandmark(x, z, 1.0)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.1 || y > 10.5) continue;

    bushes.push({
      x,
      y,
      z,
      scale: 0.75 + rand() * 0.65,
      rotation: rand() * Math.PI * 2,
      variant: rand() > 0.6 ? 1 : 0,
    });
  }

  // Grass tufts across meadows
  for (let i = 0; i < 420 && grassTufts.length < 260; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 10.5 + rand() * (ISLAND_RADIUS * 0.75);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearLandmark(x, z, 0.5)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.05 || y > 10.0) continue;

    grassTufts.push({
      x,
      y,
      z,
      scale: 0.8 + rand() * 0.8,
      rotation: rand() * Math.PI * 2,
      variant: 0,
    });
  }

  // Wildflowers around Starting Plaza & meadows
  for (let i = 0; i < 240 && flowers.length < 140; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 10.8 + rand() * (ISLAND_RADIUS * 0.65);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearLandmark(x, z, 0.5)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.2 || y > 8.5) continue;

    flowers.push({
      x,
      y,
      z,
      scale: 0.8 + rand() * 0.7,
      rotation: rand() * Math.PI * 2,
      variant: 0,
    });
  }

  // Ferns / forest plants
  for (let i = 0; i < 180 && plants.length < 95; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 12 + rand() * (ISLAND_RADIUS * 0.72);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearLandmark(x, z, 1.0)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.2 || y > 9.5) continue;

    plants.push({
      x,
      y,
      z,
      scale: 0.75 + rand() * 0.65,
      rotation: rand() * Math.PI * 2,
      variant: 0,
    });
  }

  // Fallen mossy logs & stumps
  for (let i = 0; i < 60 && fallenLogs.length < 26; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 18 + rand() * (ISLAND_RADIUS * 0.68);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearLandmark(x, z, 3)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.3 || y > 8.5) continue;

    fallenLogs.push({
      x,
      y,
      z,
      scale: 0.85 + rand() * 0.5,
      rotation: rand() * Math.PI * 2,
      variant: rand() > 0.45 ? 0 : 1,
    });
  }

  // Natural rocks & mossy boulders
  for (let i = 0; i < 160 && rocks.length < 68; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 13 + rand() * (ISLAND_RADIUS * 0.82);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (Math.hypot(x, z) < 14) continue;
    const y = getTerrainHeight(x, z);
    if (y < -0.6) continue;

    rocks.push({
      x,
      y,
      z,
      scale: 0.7 + rand() * 1.45,
      rotation: rand() * Math.PI * 2,
      variant: Math.floor(rand() * 4),
    });
  }

  return { trees, bushes, grassTufts, flowers, plants, fallenLogs, rocks };
}
