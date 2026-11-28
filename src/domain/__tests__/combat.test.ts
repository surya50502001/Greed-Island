import { describe, expect, it } from 'vitest';
import {
  applyPlayerDamage,
  awardExperience,
  calculateMeleeDamage,
  COMBO_SPECS,
  createDefaultPlayerStats,
} from '../combat/rules';

describe('combat rules & progression', () => {
  it('blocks incoming damage when blocking unless ignoreBlock is set', () => {
    const blocked = applyPlayerDamage(100, { amount: 15, sourceId: 'enemy-0' }, true);
    expect(blocked).toEqual({ appliedDamage: 0, nextHp: 100, wasBlocked: true, isFatal: false });

    const unblockable = applyPlayerDamage(
      100,
      { amount: 15, sourceId: 'trap', ignoreBlock: true },
      true
    );
    expect(unblockable.appliedDamage).toBe(15);
    expect(unblockable.nextHp).toBe(85);
  });

  it('detects fatal damage and ignores hits when already dead', () => {
    const fatal = applyPlayerDamage(10, { amount: 15, sourceId: 'enemy-1' }, false);
    expect(fatal).toEqual({ appliedDamage: 15, nextHp: 0, wasBlocked: false, isFatal: true });

    const dead = applyPlayerDamage(0, { amount: 15, sourceId: 'enemy-1' }, false);
    expect(dead.appliedDamage).toBe(0);
  });

  it('calculates melee damage and awards XP/levels', () => {
    expect(calculateMeleeDamage(COMBO_SPECS[4].damage, 4)).toBe(56);
    const base = createDefaultPlayerStats();
    const leveled = awardExperience(base, 150);
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(50);
    expect(leveled.maxHp).toBe(110);
    expect(leveled.attackBonus).toBe(2);
  });
});
