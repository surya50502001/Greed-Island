export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EnemyState {
  id: string;
  position: [number, number, number];
  home: [number, number, number];
  patrolTarget: [number, number, number];
  alive: boolean;
  respawnTimer: number;
  chasing: boolean;
  hitFlash: number;
}

export interface LandmarkInfo {
  name: string;
  x: number;
  z: number;
  radius: number;
}

export type CardId = 'flight' | 'weapon' | 'invisibility';

export interface CardDefinition {
  id: CardId;
  name: string;
  category: string;
  rarity: 'Rare' | 'Epic' | 'Mythic';
  description: string;
  accentColor: string;
  glowColor: string;
}

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'flight',
    name: 'Flight',
    category: 'AERIAL SPELL',
    rarity: 'Epic',
    description: 'Soar freely through the skies with arcane wind.',
    accentColor: '#38bdf8',
    glowColor: '#7dd3fc',
  },
  {
    id: 'weapon',
    name: 'Weapon',
    category: 'CONJURATION',
    rarity: 'Rare',
    description: 'Summon a luminous blade for melee slashes.',
    accentColor: '#22d3ee',
    glowColor: '#fbbf24',
  },
  {
    id: 'invisibility',
    name: 'Invisibility',
    category: 'ILLUSION',
    rarity: 'Mythic',
    description: 'Vanish from enemy sight for 8 seconds.',
    accentColor: '#c084fc',
    glowColor: '#e9d5ff',
  },
];

export const ISLAND_RADIUS = 135;
export const WATER_LEVEL = -1.6;
export const INVISIBILITY_DURATION = 8.0;
export const PLAYER_MAX_HP = 100;

export const LANDMARKS: LandmarkInfo[] = [
  { name: 'Starting Plaza', x: 0, z: 0, radius: 14 },
  { name: 'Ancient Ruins', x: -54, z: -46, radius: 18 },
  { name: 'Crystal Peak', x: 58, z: -50, radius: 24 },
  { name: 'Forest Shrine', x: 0, z: 64, radius: 16 },
];
