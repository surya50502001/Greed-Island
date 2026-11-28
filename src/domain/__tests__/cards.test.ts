import { describe, expect, it } from 'vitest';
import {
  addCardToInventory,
  canActivateCard,
  createEmptyInventory,
  createEmptyLoadout,
  equipCardToSlot,
  getCardUpgradeCost,
  tickCardCooldowns,
  unequipSlot,
  upgradeCard,
  validateTradeOffer,
} from '../cards/rules';
import { CARD_DEFINITIONS } from '../cards/types';

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
});
