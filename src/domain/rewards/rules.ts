import { RaidEvent, RaidParticipant } from '../raids/types';
import { BOSS_REWARD_TABLES, GrantedRewardItem, RaidRewardGrant, RewardTable } from './types';

export function isParticipantEligibleForReward(participant: RaidParticipant): boolean {
  if (participant.rewardClaimed) return false;
  return (
    participant.hitsLanded > 0 ||
    participant.totalDamageDealt > 0 ||
    participant.supportActions > 0
  );
}

export interface ClaimRewardResult {
  success: boolean;
  grant?: RaidRewardGrant;
  reason?: 'raid_not_completed' | 'not_participant' | 'already_claimed' | 'insufficient_participation' | 'missing_table';
}

/**
 * Authoritative, idempotent raid reward evaluator.
 * Sets `participant.rewardClaimed = true` on success to prevent duplicate claims.
 */
export function claimRaidRewards(
  raid: RaidEvent,
  playerId: string,
  rng: () => number = Math.random,
  tables: Record<string, RewardTable> = BOSS_REWARD_TABLES
): ClaimRewardResult {
  if (raid.status !== 'Completed' || raid.completionStatus !== 'victory') {
    return { success: false, reason: 'raid_not_completed' };
  }

  const participant = raid.participants.find((p) => p.playerId === playerId);
  if (!participant) {
    return { success: false, reason: 'not_participant' };
  }

  if (participant.rewardClaimed) {
    return { success: false, reason: 'already_claimed' };
  }

  if (!isParticipantEligibleForReward(participant)) {
    return { success: false, reason: 'insufficient_participation' };
  }

  const table = tables[raid.rewardTableId];
  if (!table) {
    return { success: false, reason: 'missing_table' };
  }

  const items: GrantedRewardItem[] = [];
  for (const entry of table.entries) {
    if (raid.tier < entry.minTier) continue;
    const bonusChance = Math.min(0.25, (raid.tier - 1) * 0.05);
    const shouldGrant = entry.guaranteed || rng() <= entry.probability + bonusChance;
    if (!shouldGrant) continue;

    const span = entry.maxQuantity - entry.minQuantity + 1;
    const qty = entry.minQuantity + Math.floor(rng() * span);
    items.push({
      id: entry.id,
      category: entry.category,
      label: entry.label,
      cardId: entry.cardId,
      quantity: Math.max(1, qty),
    });
  }

  participant.rewardClaimed = true;
  return {
    success: true,
    grant: {
      raidId: raid.raidId,
      playerId,
      tier: raid.tier,
      items,
    },
  };
}
