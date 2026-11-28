import { describe, expect, it } from 'vitest';
import {
  computeCardinalDirection,
  computeDistanceMeters,
  worldToMapPoint,
  yawToMapRotationDeg,
} from '../world/mapProjection';

describe('world map & mini-map projection helpers', () => {
  it('projects world origin to map center and offsets zoomed coordinates accurately', () => {
    const center = worldToMapPoint(0, 0, 200, 1, 0, 0);
    expect(center).toEqual({ x: 100, y: 100 });

    const east = worldToMapPoint(50, 0, 200, 1, 0, 0);
    const north = worldToMapPoint(0, -50, 200, 1, 0, 0);
    expect(east.x).toBeGreaterThan(100);
    expect(east.y).toBe(100);
    expect(north.x).toBe(100);
    expect(north.y).toBeLessThan(100);
  });

  it('converts Three.js character yaw into compass-aligned SVG rotation degrees', () => {
    // yaw = 0 faces +Z (South -> 180 deg)
    expect(yawToMapRotationDeg(0)).toBeCloseTo(180);
    // yaw = PI/2 faces +X (East -> 90 deg)
    expect(yawToMapRotationDeg(Math.PI / 2)).toBeCloseTo(90);
    // yaw = PI faces -Z (North -> 0 deg)
    expect(yawToMapRotationDeg(Math.PI)).toBeCloseTo(0);
  });

  it('computes distance in meters and 8-point cardinal direction toward raid targets', () => {
    expect(computeDistanceMeters(0, 0, 30, 40)).toBe(50);
    expect(computeCardinalDirection(0, 0, 0, -60)).toBe('N');
    expect(computeCardinalDirection(0, 0, 60, -60)).toBe('NE');
    expect(computeCardinalDirection(0, 0, 60, 0)).toBe('E');
    expect(computeCardinalDirection(0, 0, -60, 60)).toBe('SW');
    expect(computeCardinalDirection(0, 0, 0.2, 0.2)).toBe('HERE');
  });
});
