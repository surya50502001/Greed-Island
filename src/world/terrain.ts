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
 * Returns [r, g, b] in 0..1 range for terrain vertex coloring.
 */
export function getTerrainColor(x: number, z: number, y: number): [number, number, number] {
  const plazaDist = Math.hypot(x, z);
  if (plazaDist < 12) {
    return [0.76, 0.75, 0.72]; // Warm plaza stone
  }

  const ruinsDist = Math.hypot(x + 54, z + 46);
  if (ruinsDist < 15) {
    return [0.46, 0.50, 0.43]; // Mossy ruin stone
  }

  if (y < -0.4) {
    return [0.85, 0.78, 0.56]; // Sandy beach
  }
  if (y > 16.5) {
    return [0.78, 0.87, 0.96]; // Crystal Peak frost/stone
  }
  if (y > 9.5) {
    return [0.45, 0.48, 0.55]; // Mountain rock
  }

  // Lush grass variation
  const n = Math.sin(x * 0.09) * Math.cos(z * 0.09) * 0.05;
  const shrineDist = Math.hypot(x, z - 64);
  if (shrineDist < 24) {
    return [0.16 + n, 0.46 + n, 0.25]; // Deeper emerald forest grass
  }
  return [0.24 + n, 0.58 + n, 0.28];
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

export function generateWorldProps(): { trees: PropPlacement[]; rocks: PropPlacement[] } {
  const rand = seededRandom(42077);
  const trees: PropPlacement[] = [];
  const rocks: PropPlacement[] = [];

  // Place trees
  for (let i = 0; i < 240 && trees.length < 85; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 16 + rand() * (ISLAND_RADIUS * 0.72);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (isNearLandmark(x, z, 3)) continue;
    const y = getTerrainHeight(x, z);
    if (y < 0.2 || y > 13) continue;

    trees.push({
      x,
      y,
      z,
      scale: 0.85 + rand() * 0.65,
      rotation: rand() * Math.PI * 2,
      variant: rand() > 0.45 ? 0 : 1,
    });
  }

  // Extra dense ring around Forest Shrine
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2 + rand() * 0.15;
    const radius = 17 + rand() * 14;
    const x = Math.cos(angle) * radius;
    const z = 64 + Math.sin(angle) * radius;
    const y = getTerrainHeight(x, z);
    if (y < 0.2) continue;

    trees.push({
      x,
      y,
      z,
      scale: 0.95 + rand() * 0.6,
      rotation: rand() * Math.PI * 2,
      variant: rand() > 0.35 ? 1 : 0,
    });
  }

  // Place rocks
  for (let i = 0; i < 120 && rocks.length < 48; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 14 + rand() * (ISLAND_RADIUS * 0.8);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (Math.hypot(x, z) < 15) continue;
    const y = getTerrainHeight(x, z);
    if (y < -0.5) continue;

    rocks.push({
      x,
      y,
      z,
      scale: 0.6 + rand() * 1.4,
      rotation: rand() * Math.PI * 2,
      variant: Math.floor(rand() * 3),
    });
  }

  return { trees, rocks };
}
