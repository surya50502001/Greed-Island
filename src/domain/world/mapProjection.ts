import { ISLAND_RADIUS } from './island';

export interface MapPoint {
  x: number;
  y: number;
}

export const WORLD_MAP_SPAN = ISLAND_RADIUS * 2.15;

/**
 * Projects Three.js world (x, z) coordinates onto a square map canvas/SVG of size `mapSize`,
 * centered at world `(centerX, centerZ)` with zoom factor `zoom`.
 */
export function worldToMapPoint(
  worldX: number,
  worldZ: number,
  mapSize: number,
  zoom = 1,
  centerX = 0,
  centerZ = 0
): MapPoint {
  const half = mapSize / 2;
  const scale = (mapSize / WORLD_MAP_SPAN) * zoom;
  return {
    x: half + (worldX - centerX) * scale,
    y: half + (worldZ - centerZ) * scale,
  };
}

/**
 * Converts Three.js character yaw (radians, where 0 faces +Z South and PI/2 faces +X East)
 * into SVG clockwise rotation degrees (where 0 deg points Up / -Z North).
 */
export function yawToMapRotationDeg(yaw: number): number {
  return 180 - (yaw * 180) / Math.PI;
}

/**
 * Computes horizontal distance in world meters between two (x, z) points.
 */
export function computeDistanceMeters(ax: number, az: number, bx: number, bz: number): number {
  return Math.round(Math.hypot(bx - ax, bz - az));
}

/**
 * Computes 8-point cardinal compass label from (ax, az) toward (bx, bz)
 * where -Z is North, +Z is South, +X is East, -X is West.
 */
export function computeCardinalDirection(ax: number, az: number, bx: number, bz: number): string {
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.hypot(dx, dz) < 1) return 'HERE';
  const angleDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  return dirs[Math.round(angleDeg / 45) % 8];
}
