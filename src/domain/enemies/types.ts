import { ENEMY_ATTACK_DAMAGE, ENEMY_MAX_HP } from '../combat/rules';
import { Vec3 } from '../math/vec3';

export type EnemySpecies = 'wolf' | 'spider';

export type EnemyAIState =
  | 'Idle'
  | 'Patrol'
  | 'Detection'
  | 'Chase'
  | 'Attack'
  | 'Stagger'
  | 'Death'
  | 'Respawn';

export interface EnemySpeciesConfig {
  species: EnemySpecies;
  maxHp: number;
  attackDamage: number;
  aggroRange: number;
  verticalAggroRange: number;
  attackRange: number;
  patrolSpeed: number;
  chaseSpeed: number;
  attackCooldown: number;
  respawnTime: number;
  staggerDuration: number;
}

export const ENEMY_SPECIES_CONFIG: Record<EnemySpecies, EnemySpeciesConfig> = {
  wolf: {
    species: 'wolf',
    maxHp: ENEMY_MAX_HP,
    attackDamage: ENEMY_ATTACK_DAMAGE,
    aggroRange: 17,
    verticalAggroRange: 8.5,
    attackRange: 1.85,
    patrolSpeed: 2.6,
    chaseSpeed: 5.4,
    attackCooldown: 1.4,
    respawnTime: 14,
    staggerDuration: 0.35,
  },
  spider: {
    species: 'spider',
    maxHp: ENEMY_MAX_HP,
    attackDamage: ENEMY_ATTACK_DAMAGE,
    aggroRange: 17,
    verticalAggroRange: 8.5,
    attackRange: 1.85,
    patrolSpeed: 2.6,
    chaseSpeed: 5.4,
    attackCooldown: 1.4,
    respawnTime: 14,
    staggerDuration: 0.35,
  },
};

export interface EnemySpawnPoint {
  x: number;
  z: number;
  patrolRadius: number;
  species: EnemySpecies;
}

export const INITIAL_ENEMY_SPAWNS: EnemySpawnPoint[] = [
  { x: -38, z: -32, patrolRadius: 12, species: 'spider' },
  { x: -64, z: -36, patrolRadius: 10, species: 'wolf' },
  { x: -46, z: -60, patrolRadius: 11, species: 'spider' },
  { x: 28, z: -28, patrolRadius: 13, species: 'wolf' },
  { x: 42, z: 26, patrolRadius: 14, species: 'wolf' },
  { x: -26, z: 44, patrolRadius: 12, species: 'wolf' },
  { x: 16, z: 48, patrolRadius: 11, species: 'spider' },
  { x: 46, z: -62, patrolRadius: 10, species: 'spider' },
];

export interface EnemyDomainState {
  id: string;
  species: EnemySpecies;
  aiState: EnemyAIState;
  home: Vec3;
  position: Vec3;
  patrolTarget: Vec3;
  patrolRadius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer: number;
  chasing: boolean;
  targetPlayerId: string | null;
  hitFlash: number;
  staggerTimer: number;
  idleTimer: number;
  yaw: number;
  attackCooldown: number;
  knockbackX: number;
  knockbackZ: number;
}

export interface EnemyTarget {
  id: string;
  position: Vec3;
  isDead: boolean;
  isInvisible: boolean;
  isFlying?: boolean;
}

export interface EnemyAttackHitEvent {
  enemyId: string;
  targetId: string;
  damage: number;
}
