export type CardId = 'flight' | 'weapon' | 'invisibility';

/**
 * Extensible card identifier for the planned 20-card Greed Island catalog.
 */
export type AnyCardId = CardId | (string & {});

export type CardRarity = 'Common' | 'Rare' | 'Epic' | 'Mythic';

export type CardEffectType = 'toggle' | 'duration' | 'instant' | 'passive';

export interface CardDefinition<TId extends AnyCardId = CardId> {
  id: TId;
  name: string;
  category: string;
  rarity: CardRarity;
  description: string;
  accentColor: string;
  glowColor: string;
  maxLevel?: number;
  cooldownSeconds?: number;
  effectType?: CardEffectType;
}

export const MAX_ACTIVE_CARD_SLOTS = 4;
export const DEFAULT_MAX_CARD_LEVEL = 5;
export const TARGET_INITIAL_CARD_COUNT = 20;

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'flight',
    name: 'Flight',
    category: 'AERIAL SPELL',
    rarity: 'Epic',
    description: 'Soar freely through the skies with arcane wind.',
    accentColor: '#38bdf8',
    glowColor: '#7dd3fc',
    maxLevel: 5,
    cooldownSeconds: 0,
    effectType: 'toggle',
  },
  {
    id: 'weapon',
    name: 'Weapon',
    category: 'CONJURATION',
    rarity: 'Rare',
    description: 'Summon a luminous blade for melee slashes.',
    accentColor: '#22d3ee',
    glowColor: '#fbbf24',
    maxLevel: 5,
    cooldownSeconds: 0,
    effectType: 'toggle',
  },
  {
    id: 'invisibility',
    name: 'Invisibility',
    category: 'ILLUSION',
    rarity: 'Mythic',
    description: 'Vanish from enemy sight for 8 seconds.',
    accentColor: '#c084fc',
    glowColor: '#e9d5ff',
    maxLevel: 5,
    cooldownSeconds: 12,
    effectType: 'duration',
  },
];

export interface OwnedCardEntry {
  cardId: AnyCardId;
  level: number;
  duplicates: number;
}

export interface CardInventory {
  cards: Record<string, OwnedCardEntry>;
}

export type ActiveCardSlotIndex = 0 | 1 | 2 | 3;

export interface ActiveCardLoadout {
  slots: [AnyCardId | null, AnyCardId | null, AnyCardId | null, AnyCardId | null];
}

export type CardCooldownMap = Record<string, number>;

export type TradeParticipantType = 'player' | 'npc';

export interface TradeItem {
  cardId: AnyCardId;
  quantity: number;
}

export interface TradeOffer {
  tradeId: string;
  initiatorId: string;
  initiatorType: TradeParticipantType;
  targetId: string;
  targetType: TradeParticipantType;
  offeredItems: TradeItem[];
  requestedItems: TradeItem[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
}
