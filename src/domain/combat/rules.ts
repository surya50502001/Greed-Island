export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE_COOLDOWN = 0.85;
export const PLAYER_ATTACK_DAMAGE = 25;
export const ENEMY_MAX_HP = 60;
export const ENEMY_ATTACK_DAMAGE = 15;

export type ComboStep = 0 | 1 | 2 | 3 | 4;
export type ActiveComboStep = 1 | 2 | 3 | 4;

export interface ComboAttackSpec {
  name: string;
  duration: number;
  activeWindow: [number, number];
  bufferStart: number;
  chainWindow: number;
  cooldown: number;
  lunge: number;
  damage: number;
  knockback: number;
  reach: number;
  isAoe360: boolean;
}

export const COMBO_SPECS: Record<ActiveComboStep, ComboAttackSpec> = {
  1: {
    name: 'Quick Cross Slash',
    duration: 0.4,
    activeWindow: [0.24, 0.6],
    bufferStart: 0.22,
    chainWindow: 0.72,
    cooldown: 0.06,
    lunge: 3.0,
    damage: 22,
    knockback: 12,
    reach: 4.2,
    isAoe360: false,
  },
  2: {
    name: 'Reverse Slash',
    duration: 0.42,
    activeWindow: [0.24, 0.62],
    bufferStart: 0.22,
    chainWindow: 0.72,
    cooldown: 0.06,
    lunge: 3.4,
    damage: 26,
    knockback: 14,
    reach: 4.4,
    isAoe360: false,
  },
  3: {
    name: 'Spinning Crescent',
    duration: 0.54,
    activeWindow: [0.24, 0.72],
    bufferStart: 0.26,
    chainWindow: 0.78,
    cooldown: 0.08,
    lunge: 4.0,
    damage: 32,
    knockback: 16,
    reach: 4.8,
    isAoe360: true,
  },
  4: {
    name: 'Arcane Breaker',
    duration: 0.72,
    activeWindow: [0.4, 0.68],
    bufferStart: 1.0,
    chainWindow: 0,
    cooldown: 0.36,
    lunge: 5.4,
    damage: 52,
    knockback: 24,
    reach: 5.2,
    isAoe360: false,
  },
};

export interface DamageEvent {
  amount: number;
  sourceId: string;
  ignoreBlock?: boolean;
}

export interface DamageResult {
  appliedDamage: number;
  nextHp: number;
  wasBlocked: boolean;
  isFatal: boolean;
}

export interface PlayerStats {
  level: number;
  xp: number;
  maxHp: number;
  attackBonus: number;
  damageReduction: number;
}

export function createDefaultPlayerStats(): PlayerStats {
  return {
    level: 1,
    xp: 0,
    maxHp: PLAYER_MAX_HP,
    attackBonus: 0,
    damageReduction: 0,
  };
}

export function getXpForNextLevel(level: number): number {
  return 100 * level;
}

export function awardExperience(stats: PlayerStats, amount: number): PlayerStats {
  if (amount <= 0) return stats;
  let level = stats.level;
  let xp = stats.xp + amount;
  let maxHp = stats.maxHp;
  let attackBonus = stats.attackBonus;

  while (xp >= getXpForNextLevel(level)) {
    xp -= getXpForNextLevel(level);
    level += 1;
    maxHp += 10;
    attackBonus += 2;
  }

  return { ...stats, level, xp, maxHp, attackBonus };
}

/**
 * Pure, extensible damage calculation helper so armor, buffs, or boss
 * modifiers can be layered in without rewriting HUD/controller code.
 */
export function applyPlayerDamage(
  currentHp: number,
  event: DamageEvent,
  isBlocking: boolean,
  damageReduction = 0
): DamageResult {
  if (currentHp <= 0) {
    return { appliedDamage: 0, nextHp: 0, wasBlocked: false, isFatal: false };
  }

  if (isBlocking && !event.ignoreBlock) {
    return { appliedDamage: 0, nextHp: currentHp, wasBlocked: true, isFatal: false };
  }

  const mitigated = Math.max(1, Math.round(event.amount * (1 - Math.min(0.9, damageReduction))));
  const nextHp = Math.max(0, currentHp - mitigated);

  return {
    appliedDamage: mitigated,
    nextHp,
    wasBlocked: false,
    isFatal: nextHp <= 0,
  };
}

export function calculateMeleeDamage(baseDamage: number, attackBonus = 0): number {
  return Math.max(1, Math.round(baseDamage + attackBonus));
}
