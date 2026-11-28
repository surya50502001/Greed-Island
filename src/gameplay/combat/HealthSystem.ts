export {
  PLAYER_MAX_HP,
  PLAYER_DAMAGE_COOLDOWN,
  PLAYER_ATTACK_DAMAGE,
  ENEMY_MAX_HP,
  ENEMY_ATTACK_DAMAGE,
  applyPlayerDamage,
  calculateMeleeDamage,
  createDefaultPlayerStats,
  awardExperience,
  getXpForNextLevel,
} from '../../domain/combat/rules';
export type {
  DamageEvent,
  DamageResult,
  PlayerStats,
} from '../../domain/combat/rules';
