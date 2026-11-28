import { AnyCardId } from '../cards/types';
import { RaidTier } from '../raids/types';

export type RewardCategory =
  | 'card'
  | 'exclusive_card'
  | 'card_duplicates'
  | 'progression_material'
  | 'crafting_resource'
  | 'cosmetic'
  | 'collectible';

export interface RewardEntry {
  id: string;
  category: RewardCategory;
  label: string;
  cardId?: AnyCardId;
  minQuantity: number;
  maxQuantity: number;
  probability: number;
  guaranteed: boolean;
  minTier: RaidTier;
}

export interface RewardTable {
  rewardTableId: string;
  entries: RewardEntry[];
}

export interface GrantedRewardItem {
  id: string;
  category: RewardCategory;
  label: string;
  cardId?: AnyCardId;
  quantity: number;
}

export interface RaidRewardGrant {
  raidId: string;
  playerId: string;
  tier: RaidTier;
  items: GrantedRewardItem[];
}

export const BOSS_REWARD_TABLES: Record<string, RewardTable> = {
  reward_fenrir_alpha: {
    rewardTableId: 'reward_fenrir_alpha',
    entries: [
      {
        id: 'fenrir_mist_shard',
        category: 'progression_material',
        label: 'Mist Core Shard',
        minQuantity: 2,
        maxQuantity: 5,
        probability: 1.0,
        guaranteed: true,
        minTier: 1,
      },
      {
        id: 'fenrir_weapon_dup',
        category: 'card_duplicates',
        label: 'Weapon Card Duplicate',
        cardId: 'weapon',
        minQuantity: 1,
        maxQuantity: 2,
        probability: 1.0,
        guaranteed: true,
        minTier: 1,
      },
      {
        id: 'fenrir_flight_card',
        category: 'card',
        label: 'Flight Card',
        cardId: 'flight',
        minQuantity: 1,
        maxQuantity: 1,
        probability: 0.55,
        guaranteed: false,
        minTier: 1,
      },
      {
        id: 'fenrir_fang_card',
        category: 'exclusive_card',
        label: 'Fenrir Frost Fang (Boss Card)',
        cardId: 'fenrir_frost_fang',
        minQuantity: 1,
        maxQuantity: 1,
        probability: 0.45,
        guaranteed: false,
        minTier: 2,
      },
      {
        id: 'fenrir_invis_dup',
        category: 'card_duplicates',
        label: 'Invisibility Card Duplicate',
        cardId: 'invisibility',
        minQuantity: 1,
        maxQuantity: 1,
        probability: 0.4,
        guaranteed: false,
        minTier: 3,
      },
      {
        id: 'fenrir_alpha_crest',
        category: 'collectible',
        label: 'Alpha Mist Crest',
        minQuantity: 1,
        maxQuantity: 1,
        probability: 0.3,
        guaranteed: false,
        minTier: 3,
      },
    ],
  },
};
