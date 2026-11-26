export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE_COOLDOWN = 0.85;
export const PLAYER_ATTACK_DAMAGE = 25;
export const ENEMY_MAX_HP = 60;
export const ENEMY_ATTACK_DAMAGE = 15;

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
