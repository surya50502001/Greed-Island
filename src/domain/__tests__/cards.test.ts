import { describe, expect, it } from 'vitest';
import {
  addCardToInventory,
  canActivateCard,
  createEmptyInventory,
  createEmptyLoadout,
  createStarterInventory,
  createStarterLoadout,
  equipCardToSlot,
  getCardUpgradeCost,
  getEffectiveCardCooldown,
  getFlightSpeedMultiplier,
  getInvisibilityDuration,
  getWeaponAttackBonus,
  tickCardCooldowns,
  unequipSlot,
  upgradeCard,
  validateTradeOffer,
} from '../cards/rules';
import { CARD_DEFINITIONS } from '../cards/types';
import { createRaidEvent, forceStartGatheringRaid, joinRaid, stepRaidLifecycle } from '../raids/scheduler';
import { claimRaidRewards } from '../rewards/rules';

describe('card inventory, upgrades, loadout, and trade rules', () => {
  it('unlocks level 1 on first copy and accumulates duplicates', () => {
    let inv = createEmptyInventory();
    inv = addCardToInventory(inv, 'weapon', 1);
    expect(inv.cards['weapon']).toEqual({ cardId: 'weapon', level: 1, duplicates: 0 });

    inv = addCardToInventory(inv, 'weapon', 2);
    expect(inv.cards['weapon']).toEqual({ cardId: 'weapon', level: 1, duplicates: 2 });
  });

  it('enforces duplicate cost and max level when upgrading', () => {
    const weaponDef = CARD_DEFINITIONS.find((c) => c.id === 'weapon');
    let inv = addCardToInventory(createEmptyInventory(), 'weapon', 2);
    expect(getCardUpgradeCost(1)).toBe(2);

    const fail = upgradeCard(inv, 'weapon', weaponDef);
    expect(fail.success).toBe(false);
    expect(fail.reason).toBe('insufficient_duplicates');

    inv = addCardToInventory(inv, 'weapon', 1);
    const ok = upgradeCard(inv, 'weapon', weaponDef);
    expect(ok.success).toBe(true);
    expect(ok.inventory.cards['weapon'].level).toBe(2);
    expect(ok.inventory.cards['weapon'].duplicates).toBe(0);
  });

  it('validates 4-slot loadout without duplicate equips and checks cooldowns', () => {
    const inv = addCardToInventory(createEmptyInventory(), 'flight', 1);
    let loadout = createEmptyLoadout();

    const notOwned = equipCardToSlot(loadout, inv, 'weapon', 0);
    expect(notOwned.success).toBe(false);

    const eq0 = equipCardToSlot(loadout, inv, 'flight', 0);
    expect(eq0.success).toBe(true);
    loadout = equipCardToSlot(eq0.loadout, inv, 'flight', 2).loadout;
    expect(loadout.slots).toEqual([null, null, 'flight', null]);

    expect(canActivateCard('flight', loadout, {}).allowed).toBe(true);
    expect(canActivateCard('flight', loadout, { flight: 3.5 }).reason).toBe('on_cooldown');
    expect(tickCardCooldowns({ flight: 1.0 }, 1.2)).toEqual({});

    loadout = unequipSlot(loadout, 2);
    expect(canActivateCard('flight', loadout, {}).reason).toBe('not_equipped');
  });

  it('validates player-to-player trade offers using duplicate counts', () => {
    const p1 = addCardToInventory(createEmptyInventory(), 'weapon', 3); // 2 duplicates
    const p2 = addCardToInventory(createEmptyInventory(), 'flight', 2); // 1 duplicate

    const valid = validateTradeOffer(
      {
        tradeId: 't-1',
        initiatorId: 'p1',
        initiatorType: 'player',
        targetId: 'p2',
        targetType: 'player',
        offeredItems: [{ cardId: 'weapon', quantity: 2 }],
        requestedItems: [{ cardId: 'flight', quantity: 1 }],
        status: 'pending',
      },
      p1,
      p2
    );
    expect(valid.valid).toBe(true);

    const invalid = validateTradeOffer(
      {
        tradeId: 't-2',
        initiatorId: 'p1',
        initiatorType: 'player',
        targetId: 'p2',
        targetType: 'player',
        offeredItems: [{ cardId: 'weapon', quantity: 3 }],
        requestedItems: [],
        status: 'pending',
      },
      p1,
      p2
    );
    expect(invalid.valid).toBe(false);
  });

  it('enforces max level 5, invalid slots, and level-scaled card effects', () => {
    const weaponDef = CARD_DEFINITIONS.find((c) => c.id === 'weapon');
    const invisDef = CARD_DEFINITIONS.find((c) => c.id === 'invisibility');

    let inv = createStarterInventory();
    const loadout = createStarterLoadout();
    expect(loadout.slots[0]).toBe('weapon');

    // Invalid slot index
    const badSlot = equipCardToSlot(loadout, inv, 'weapon', 4 as never);
    expect(badSlot.success).toBe(false);
    expect(badSlot.reason).toBe('invalid_slot');

    // Upgrade weapon all the way to max level 5 (costs: 2 + 4 + 6 + 8 = 20 duplicates)
    inv = addCardToInventory(inv, 'weapon', 25);
    for (let lvl = 1; lvl < 5; lvl++) {
      const res = upgradeCard(inv, 'weapon', weaponDef);
      expect(res.success).toBe(true);
      inv = res.inventory;
    }
    expect(inv.cards['weapon'].level).toBe(5);
    const maxFail = upgradeCard(inv, 'weapon', weaponDef);
    expect(maxFail.success).toBe(false);
    expect(maxFail.reason).toBe('max_level');

    // Level-scaled effects
    expect(getWeaponAttackBonus(1)).toBe(0);
    expect(getWeaponAttackBonus(5)).toBe(16);
    expect(getFlightSpeedMultiplier(3)).toBeCloseTo(1.16);
    expect(getInvisibilityDuration(3, 8)).toBe(11);
    expect(getEffectiveCardCooldown(invisDef, 3)).toBe(10);
  });

  it('grants card and duplicate rewards into inventory and prevents double-claiming', () => {
    const raid = createRaidEvent({
      raidId: 'r-inv',
      bossId: 'boss_fenrir_alpha',
      bossName: 'Fenrir',
      bossTitle: 'Alpha of the Mist',
      bossMaxHp: 600,
      rewardTableId: 'reward_fenrir_alpha',
      tier: 3,
      location: { x: 25, y: 3, z: 25 },
      nowSec: 0,
      startImmediatelyInGathering: true,
    });
    joinRaid(raid, 'p1', 'Hunter', 1);
    forceStartGatheringRaid(raid, 2);
    raid.participants[0].hitsLanded = 2;
    raid.participants[0].totalDamageDealt = 600;
    raid.bossHp = 0;
    stepRaidLifecycle(raid, 10);

    const claim = claimRaidRewards(raid, 'p1', () => 0.1);
    expect(claim.success).toBe(true);
    let inv = createStarterInventory();
    for (const item of claim.grant!.items) {
      if (item.cardId) {
        inv = addCardToInventory(inv, item.cardId, item.quantity);
      }
    }
    expect(inv.cards['weapon'].duplicates).toBeGreaterThanOrEqual(1);
    expect(claimRaidRewards(raid, 'p1').reason).toBe('already_claimed');
  });
});
