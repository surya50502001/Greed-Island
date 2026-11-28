export interface LandmarkInfo {
  name: string;
  x: number;
  z: number;
  radius: number;
}

export const ISLAND_RADIUS = 135;
export const WATER_LEVEL = -1.6;
export const INVISIBILITY_DURATION = 8.0;

export const LANDMARKS: LandmarkInfo[] = [
  { name: 'Starting Plaza', x: 0, z: 0, radius: 14 },
  { name: 'Ancient Ruins', x: -54, z: -46, radius: 18 },
  { name: 'Crystal Peak', x: 58, z: -50, radius: 24 },
  { name: 'Forest Shrine', x: 0, z: 64, radius: 16 },
];
