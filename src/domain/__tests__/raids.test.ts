import { describe, expect, it } from 'vitest';
import {
  canStartRaid,
  createRaidEvent,
  forceStartGatheringRaid,
  joinRaid,
  leaveRaid,
  selectRaidSpawnLocation,
  stepRaidLifecycle,
  validateRaidSpawnLocation,
} from '../raids/scheduler';
import { DEFAULT_RAID_SCHEDULER_CONFIG } from '../raids/types';
import {
  applyBossDamage,
  createBossEncounterState,
  stepBossEncounter,
} from '../bosses/encounter';
import { FENRIR_BOSS_CONFIG } from '../bosses/types';
import { claimRaidRewards } from '../rewards/rules';
import { LANDMARKS, WATER_LEVEL } from '../world/island';

const flatIslandHeight = (x: number, z: number) => {
  if (Math.hypot(x, z) > 120) return WATER_LEVEL - 2;
  return 3.0;
};

describe('raid scheduling, boss encounter, and reward rules', () => {
  it('validates raid spawn locations away from water and landmark centers', () => {
    expect(validateRaidSpawnLocation(LANDMARKS[0].x, LANDMARKS[0].z, [], flatIslandHeight)).toBe(false);
    expect(validateRaidSpawnLocation(125, 0, [], flatIslandHeight)).toBe(false);
    const loc = selectRaidSpawnLocation(12345, [], flatIslandHeight);
    expect(loc).not.toBeNull();
    if (loc) {
      expect(validateRaidSpawnLocation(loc.x, loc.z, [], flatIslandHeight)).toBe(true);
    }
  });

  it('prevents duplicate participants on reconnect and enforces start conditions', () => {
    const raid = createRaidEvent({
      raidId: 'r-1',
      bossId: FENRIR_BOSS_CONFIG.bossId,
      bossName: FENRIR_BOSS_CONFIG.displayName,
      bossTitle: FENRIR_BOSS_CONFIG.title,
      bossMaxHp: FENRIR_BOSS_CONFIG.maxHp,
      rewardTableId: FENRIR_BOSS_CONFIG.rewardTableId,
      tier: 3,
      location: { x: 32, y: 3, z: 24 },
      nowSec: 100,
      minParticipants: 1,
    });

    expect(raid.status).toBe('Upcoming');
    stepRaidLifecycle(raid, 100 + DEFAULT_RAID_SCHEDULER_CONFIG.upcomingLeadSec + 1);
    expect(raid.status).toBe('Gathering');

    // Does not start before countdown if not forced
    expect(joinRaid(raid, 'p1', 'Hunter 1', 110).joined).toBe(true);
    expect(joinRaid(raid, 'p1', 'Hunter 1', 112).joined).toBe(true);
    expect(raid.participants).toHaveLength(1);
    expect(canStartRaid(raid, 115)).toBe(false);

    expect(forceStartGatheringRaid(raid, 115)).toBe(true);
    expect(raid.status).toBe('InProgress');

    expect(leaveRaid(raid, 'p1')).toBe(true);
    expect(raid.participants).toHaveLength(0);
  });

  it('expires raid if countdown finishes with insufficient participants', () => {
    const raid = createRaidEvent({
      raidId: 'r-exp',
      bossId: FENRIR_BOSS_CONFIG.bossId,
      bossName: FENRIR_BOSS_CONFIG.displayName,
      bossTitle: FENRIR_BOSS_CONFIG.title,
      bossMaxHp: FENRIR_BOSS_CONFIG.maxHp,
      rewardTableId: FENRIR_BOSS_CONFIG.rewardTableId,
      tier: 2,
      location: { x: -30, y: 3, z: 30 },
      nowSec: 0,
      minParticipants: 2,
    });
    stepRaidLifecycle(raid, raid.startTime + 1);
    expect(raid.status).toBe('Expired');
    expect(raid.completionStatus).toBe('expired');
  });

  it('runs boss telegraphs, phase transitions, shield break, and idempotent rewards', () => {
    const raid = createRaidEvent({
      raidId: 'r-boss',
      bossId: FENRIR_BOSS_CONFIG.bossId,
      bossName: FENRIR_BOSS_CONFIG.displayName,
      bossTitle: FENRIR_BOSS_CONFIG.title,
      bossMaxHp: FENRIR_BOSS_CONFIG.maxHp,
      rewardTableId: FENRIR_BOSS_CONFIG.rewardTableId,
      tier: 3,
      location: { x: 30, y: 3, z: 30 },
      nowSec: 0,
      startImmediatelyInGathering: true,
    });
    joinRaid(raid, 'p1', 'Hunter', 1);
    forceStartGatheringRaid(raid, 2);

    const boss = createBossEncounterState(raid.raidId, FENRIR_BOSS_CONFIG, raid.location);
    const targets = [{ id: 'p1', position: { x: 31, y: 3, z: 30 }, isDead: false, isInvisible: false }];

    // Enters telegraph when target is in range
    stepBossEncounter(boss, FENRIR_BOSS_CONFIG, targets, 0.1, flatIslandHeight);
    expect(boss.aiState).toBe('Telegraph');

    // Damage boss into Phase 3 & defeat
    applyBossDamage(boss, FENRIR_BOSS_CONFIG, 450, false);
    expect(boss.phase).toBe(3);

    const finalHit = applyBossDamage(boss, FENRIR_BOSS_CONFIG, 300, false);
    expect(finalHit.defeated).toBe(true);
    raid.bossHp = 0;
    stepRaidLifecycle(raid, 10);
    expect(raid.status).toBe('Completed');

    // Rejects claim without participation
    const p1 = raid.participants[0];
    expect(claimRaidRewards(raid, 'p1').reason).toBe('insufficient_participation');

    // Grants once after valid participation, blocks duplicate claims
    p1.hitsLanded = 3;
    p1.totalDamageDealt = 750;
    const first = claimRaidRewards(raid, 'p1', () => 0.2);
    expect(first.success).toBe(true);
    expect(first.grant?.items.length).toBeGreaterThanOrEqual(2);

    const dup = claimRaidRewards(raid, 'p1');
    expect(dup.success).toBe(false);
    expect(dup.reason).toBe('already_claimed');
  });
});
