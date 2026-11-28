import {
  ActiveCardLoadout,
  ActiveCardSlotIndex,
  AnyCardId,
  CardCooldownMap,
  CardDefinition,
  CardInventory,
  DEFAULT_MAX_CARD_LEVEL,
  MAX_ACTIVE_CARD_SLOTS,
  TradeOffer,
} from './types';

export function createEmptyInventory(): CardInventory {
  return { cards: {} };
}

export function createEmptyLoadout(): ActiveCardLoadout {
  return { slots: [null, null, null, null] };
}

export function createStarterInventory(): CardInventory {
  return addCardToInventory(createEmptyInventory(), 'weapon', 1);
}

export function createStarterLoadout(): ActiveCardLoadout {
  return { slots: ['weapon', null, null, null] };
}

export function getWeaponAttackBonus(level: number): number {
  return Math.max(0, level - 1) * 4;
}

export function getFlightSpeedMultiplier(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.08;
}

export function getInvisibilityDuration(level: number, baseDuration: number): number {
  return baseDuration + Math.max(0, level - 1) * 1.5;
}

export function getEffectiveCardCooldown(
  definition: CardDefinition<AnyCardId> | undefined,
  level: number
): number {
  const base = definition?.cooldownSeconds ?? 0;
  if (base <= 0) return 0;
  return Math.max(4, base - Math.max(0, level - 1));
}

/**
 * Adds `count` copies of a card to inventory. First copy unlocks level 1;
 * additional copies accumulate as duplicates for upgrading.
 */
export function addCardToInventory(
  inventory: CardInventory,
  cardId: AnyCardId,
  count = 1
): CardInventory {
  if (count <= 0) return inventory;
  const existing = inventory.cards[cardId];
  const nextEntry = existing
    ? {
        ...existing,
        duplicates: existing.duplicates + count,
      }
    : {
        cardId,
        level: 1,
        duplicates: count - 1,
      };

  return {
    cards: {
      ...inventory.cards,
      [cardId]: nextEntry,
    },
  };
}

/**
 * Duplicate cost required to upgrade a card from `currentLevel` to `currentLevel + 1`.
 */
export function getCardUpgradeCost(currentLevel: number): number {
  if (currentLevel < 1) return 1;
  return currentLevel * 2;
}

export interface UpgradeCardResult {
  success: boolean;
  inventory: CardInventory;
  reason?: 'not_owned' | 'max_level' | 'insufficient_duplicates';
}

export function upgradeCard(
  inventory: CardInventory,
  cardId: AnyCardId,
  definition?: CardDefinition<AnyCardId>
): UpgradeCardResult {
  const entry = inventory.cards[cardId];
  if (!entry) {
    return { success: false, inventory, reason: 'not_owned' };
  }
  const maxLevel = definition?.maxLevel ?? DEFAULT_MAX_CARD_LEVEL;
  if (entry.level >= maxLevel) {
    return { success: false, inventory, reason: 'max_level' };
  }
  const cost = getCardUpgradeCost(entry.level);
  if (entry.duplicates < cost) {
    return { success: false, inventory, reason: 'insufficient_duplicates' };
  }

  return {
    success: true,
    inventory: {
      cards: {
        ...inventory.cards,
        [cardId]: {
          ...entry,
          level: entry.level + 1,
          duplicates: entry.duplicates - cost,
        },
      },
    },
  };
}

export interface EquipSlotResult {
  success: boolean;
  loadout: ActiveCardLoadout;
  reason?: 'not_owned' | 'invalid_slot';
}

export function equipCardToSlot(
  loadout: ActiveCardLoadout,
  inventory: CardInventory,
  cardId: AnyCardId,
  slotIndex: ActiveCardSlotIndex
): EquipSlotResult {
  if (slotIndex < 0 || slotIndex >= MAX_ACTIVE_CARD_SLOTS) {
    return { success: false, loadout, reason: 'invalid_slot' };
  }
  if (!inventory.cards[cardId]) {
    return { success: false, loadout, reason: 'not_owned' };
  }

  const nextSlots: ActiveCardLoadout['slots'] = [...loadout.slots];
  // Remove card from any previous slot to prevent duplicate equipping
  for (let i = 0; i < nextSlots.length; i++) {
    if (nextSlots[i] === cardId) nextSlots[i] = null;
  }
  nextSlots[slotIndex] = cardId;

  return { success: true, loadout: { slots: nextSlots } };
}

export function unequipSlot(
  loadout: ActiveCardLoadout,
  slotIndex: ActiveCardSlotIndex
): ActiveCardLoadout {
  const nextSlots: ActiveCardLoadout['slots'] = [...loadout.slots];
  nextSlots[slotIndex] = null;
  return { slots: nextSlots };
}

export function canActivateCard(
  cardId: AnyCardId,
  loadout: ActiveCardLoadout,
  cooldowns: CardCooldownMap
): { allowed: boolean; reason?: 'not_equipped' | 'on_cooldown' } {
  if (!loadout.slots.includes(cardId)) {
    return { allowed: false, reason: 'not_equipped' };
  }
  if ((cooldowns[cardId] ?? 0) > 0) {
    return { allowed: false, reason: 'on_cooldown' };
  }
  return { allowed: true };
}

export function tickCardCooldowns(cooldowns: CardCooldownMap, dt: number): CardCooldownMap {
  const next: CardCooldownMap = {};
  for (const [id, remaining] of Object.entries(cooldowns)) {
    const updated = remaining - dt;
    if (updated > 0) {
      next[id] = updated;
    }
  }
  return next;
}

export function validateTradeOffer(
  offer: TradeOffer,
  initiatorInventory: CardInventory,
  targetInventory: CardInventory
): { valid: boolean; reason?: string } {
  if (offer.initiatorId === offer.targetId) {
    return { valid: false, reason: 'cannot_trade_with_self' };
  }
  if (offer.offeredItems.length === 0 && offer.requestedItems.length === 0) {
    return { valid: false, reason: 'empty_trade' };
  }

  for (const item of offer.offeredItems) {
    const owned = initiatorInventory.cards[item.cardId];
    if (!owned || item.quantity <= 0 || owned.duplicates < item.quantity) {
      return { valid: false, reason: `initiator_missing_duplicates:${item.cardId}` };
    }
  }

  for (const item of offer.requestedItems) {
    const owned = targetInventory.cards[item.cardId];
    if (!owned || item.quantity <= 0 || owned.duplicates < item.quantity) {
      return { valid: false, reason: `target_missing_duplicates:${item.cardId}` };
    }
  }

  return { valid: true };
}
