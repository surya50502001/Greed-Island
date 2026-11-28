import { describe, expect, it } from 'vitest';
import {
  addVec3,
  clamp,
  distanceXZ,
  normalizeXZ,
  seededRandom,
  smoothstep,
  subVec3,
  vec3,
} from '../math/vec3';

describe('vec3 & math helpers', () => {
  it('creates, adds, and subtracts Vec3', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, -1, 2);
    expect(addVec3(a, b)).toEqual({ x: 5, y: 1, z: 5 });
    expect(subVec3(b, a)).toEqual({ x: 3, y: -3, z: -1 });
  });

  it('computes XZ distance and normalization', () => {
    expect(distanceXZ(vec3(0, 10, 0), vec3(3, 99, 4))).toBe(5);
    const n = normalizeXZ(3, 4);
    expect(n.x).toBeCloseTo(0.6);
    expect(n.z).toBeCloseTo(0.8);
    expect(n.length).toBe(5);
    expect(normalizeXZ(0, 0)).toEqual({ x: 0, z: 0, length: 0 });
  });

  it('clamps, smoothsteps, and generates deterministic seeded numbers', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
    const r1 = seededRandom(42077);
    const r2 = seededRandom(42077);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
