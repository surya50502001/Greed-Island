import { Vec3 } from '../math/vec3';

export type BossAIState =
  | 'Idle'
  | 'Chase'
  | 'Telegraph'
  | 'Attack'
  | 'Recover'
  | 'Vulnerable'
  | 'Defeated';

export type BossTelegraphShape = 'circle' | 'cone';

export interface BossAbilityConfig {
  id: string;
  name: string;
  kind: 'melee' | 'aoe' | 'ranged' | 'cataclysm';
  telegraphShape: BossTelegraphShape;
  telegraphDuration: number;
  recoverDuration: number;
  cooldown: number;
  range: number;
  radius: number;
  coneCosine?: number;
  damage: number;
  grantsShield?: number;
  vulnerabilityAfterSec?: number;
}

export interface BossPhaseConfig {
  phase: 1 | 2 | 3;
  hpThresholdPct: number;
  speedMultiplier: number;
  damageMultiplier: number;
  cooldownMultiplier: number;
  unlockedAbilities: string[];
}

export interface BossWeakPointConfig {
  id: string;
  label: string;
  damageMultiplier: number;
}

export interface BossConfig {
  bossId: string;
  displayName: string;
  title: string;
  modelUrl: string;
  scale: number;
  accentColor: string;
  maxHp: number;
  baseDamage: number;
  moveSpeed: number;
  attackRange: number;
  rewardTableId: string;
  phases: BossPhaseConfig[];
  abilities: BossAbilityConfig[];
  weakPoints: BossWeakPointConfig[];
}

export const FENRIR_BOSS_CONFIG: BossConfig = {
  bossId: 'boss_fenrir_alpha',
  displayName: 'Fenrir',
  title: 'Alpha of the Mist',
  modelUrl: '/models/enemies/Wolf.glb',
  scale: 2.7,
  accentColor: '#a855f7',
  maxHp: 600,
  baseDamage: 18,
  moveSpeed: 5.2,
  attackRange: 3.4,
  rewardTableId: 'reward_fenrir_alpha',
  phases: [
    {
      phase: 1,
      hpThresholdPct: 1.0,
      speedMultiplier: 1.0,
      damageMultiplier: 1.0,
      cooldownMultiplier: 1.0,
      unlockedAbilities: ['rending_lunge', 'frost_nova'],
    },
    {
      phase: 2,
      hpThresholdPct: 0.65,
      speedMultiplier: 1.18,
      damageMultiplier: 1.15,
      cooldownMultiplier: 0.85,
      unlockedAbilities: ['rending_lunge', 'frost_nova', 'void_howl_barrage'],
    },
    {
      phase: 3,
      hpThresholdPct: 0.32,
      speedMultiplier: 1.32,
      damageMultiplier: 1.3,
      cooldownMultiplier: 0.72,
      unlockedAbilities: ['rending_lunge', 'frost_nova', 'void_howl_barrage', 'eclipse_cataclysm'],
    },
  ],
  abilities: [
    {
      id: 'rending_lunge',
      name: 'Rending Lunge',
      kind: 'melee',
      telegraphShape: 'cone',
      telegraphDuration: 0.65,
      recoverDuration: 0.55,
      cooldown: 2.6,
      range: 4.2,
      radius: 4.2,
      coneCosine: 0.35,
      damage: 18,
    },
    {
      id: 'frost_nova',
      name: 'Mist Frost Nova',
      kind: 'aoe',
      telegraphShape: 'circle',
      telegraphDuration: 1.1,
      recoverDuration: 0.9,
      cooldown: 5.5,
      range: 5.8,
      radius: 5.6,
      damage: 24,
    },
    {
      id: 'void_howl_barrage',
      name: 'Void Howl Surge',
      kind: 'ranged',
      telegraphShape: 'circle',
      telegraphDuration: 0.95,
      recoverDuration: 0.75,
      cooldown: 6.2,
      range: 14.0,
      radius: 3.4,
      damage: 22,
    },
    {
      id: 'eclipse_cataclysm',
      name: 'Eclipse Cataclysm',
      kind: 'cataclysm',
      telegraphShape: 'circle',
      telegraphDuration: 1.45,
      recoverDuration: 0.5,
      cooldown: 11.0,
      range: 8.5,
      radius: 7.4,
      damage: 32,
      grantsShield: 80,
      vulnerabilityAfterSec: 3.5,
    },
  ],
  weakPoints: [
    {
      id: 'mist_crest',
      label: 'Arcane Dorsal Crest',
      damageMultiplier: 1.6,
    },
  ],
};

export interface BossEncounterState {
  raidId: string;
  bossId: string;
  position: Vec3;
  home: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  aiState: BossAIState;
  activeAbilityId: string | null;
  telegraphShape: BossTelegraphShape;
  telegraphCenter: Vec3;
  telegraphRadius: number;
  telegraphTimer: number;
  telegraphDuration: number;
  recoverTimer: number;
  vulnerableTimer: number;
  shieldHp: number;
  weakPointExposed: boolean;
  hitFlash: number;
  cooldowns: Record<string, number>;
}

export interface BossTarget {
  id: string;
  position: Vec3;
  isDead: boolean;
  isInvisible: boolean;
}

export interface BossAttackEvent {
  abilityId: string;
  abilityName: string;
  damage: number;
  hitPlayerIds: string[];
  center: Vec3;
  radius: number;
}
