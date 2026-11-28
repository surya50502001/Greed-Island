import { distanceXZ, seededRandom, vec3, Vec3 } from '../math/vec3';
import { ISLAND_RADIUS, LANDMARKS, WATER_LEVEL } from '../world/island';
import {
  DEFAULT_RAID_SCHEDULER_CONFIG,
  RaidDifficulty,
  RaidEvent,
  RaidParticipant,
  RaidSchedulerConfig,
  RaidTier,
} from './types';

export type TerrainHeightFn = (x: number, z: number) => number;

export function difficultyForTier(tier: RaidTier): RaidDifficulty {
  if (tier <= 1) return 'Normal';
  if (tier === 2) return 'Hard';
  if (tier <= 4) return 'Heroic';
  return 'Mythic';
}

export function rollRaidTier(
  rng: () => number,
  probabilities: Record<RaidTier, number>
): RaidTier {
  const tiers: RaidTier[] = [1, 2, 3, 4, 5];
  const total = tiers.reduce((sum, t) => sum + (probabilities[t] ?? 0), 0);
  if (total <= 0) return 3;
  let roll = rng() * total;
  for (const t of tiers) {
    roll -= probabilities[t] ?? 0;
    if (roll <= 0) return t;
  }
  return 3;
}

export function validateRaidSpawnLocation(
  x: number,
  z: number,
  existingRaids: RaidEvent[],
  getTerrainHeight: TerrainHeightFn,
  config: RaidSchedulerConfig = DEFAULT_RAID_SCHEDULER_CONFIG
): boolean {
  const distFromCenter = Math.hypot(x, z);
  if (distFromCenter > ISLAND_RADIUS * 0.72 || distFromCenter < 14) {
    return false;
  }

  const y = getTerrainHeight(x, z);
  if (y < WATER_LEVEL + config.minHeightAboveWater || y > 18) {
    return false;
  }

  // Check terrain flatness around spawn (avoid cliffs)
  const sampleStep = 3.0;
  const maxSlopeHeight = config.maxTerrainSlope * sampleStep;
  const hN = getTerrainHeight(x, z - sampleStep);
  const hS = getTerrainHeight(x, z + sampleStep);
  const hE = getTerrainHeight(x + sampleStep, z);
  const hW = getTerrainHeight(x - sampleStep, z);
  if (
    Math.abs(hN - y) > maxSlopeHeight ||
    Math.abs(hS - y) > maxSlopeHeight ||
    Math.abs(hE - y) > maxSlopeHeight ||
    Math.abs(hW - y) > maxSlopeHeight
  ) {
    return false;
  }

  // Keep raids independent of permanent landmark centers
  for (const lm of LANDMARKS) {
    if (Math.hypot(x - lm.x, z - lm.z) < config.minDistanceFromLandmarkCenter) {
      return false;
    }
  }

  // Prevent overlapping simultaneous raids
  const candidate = vec3(x, y, z);
  for (const raid of existingRaids) {
    if (
      raid.status === 'Completed' ||
      raid.status === 'Failed' ||
      raid.status === 'Expired'
    ) {
      continue;
    }
    if (distanceXZ(candidate, raid.location) < config.minDistanceBetweenRaids) {
      return false;
    }
  }

  return true;
}

export function selectRaidSpawnLocation(
  seed: number,
  existingRaids: RaidEvent[],
  getTerrainHeight: TerrainHeightFn,
  config: RaidSchedulerConfig = DEFAULT_RAID_SCHEDULER_CONFIG
): Vec3 | null {
  const rng = seededRandom(seed);
  for (let i = 0; i < 60; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 18 + rng() * (ISLAND_RADIUS * 0.66 - 18);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (validateRaidSpawnLocation(x, z, existingRaids, getTerrainHeight, config)) {
      return vec3(Math.round(x * 10) / 10, getTerrainHeight(x, z), Math.round(z * 10) / 10);
    }
  }
  return null;
}

export function describeWorldRegion(loc: Vec3): string {
  const ns = loc.z < -20 ? 'North' : loc.z > 20 ? 'South' : '';
  const ew = loc.x < -20 ? 'West' : loc.x > 20 ? 'East' : '';
  const dir = [ns, ew].filter(Boolean).join('-');
  if (!dir) return 'Central Wilds';
  return `${dir} Highlands`;
}

export interface CreateRaidParams {
  raidId: string;
  bossId: string;
  bossName: string;
  bossTitle: string;
  bossMaxHp: number;
  rewardTableId: string;
  tier: RaidTier;
  location: Vec3;
  nowSec: number;
  minParticipants?: number;
  recommendedPartySize?: number;
  maxParticipants?: number;
  config?: RaidSchedulerConfig;
  startImmediatelyInGathering?: boolean;
}

export function createRaidEvent(params: CreateRaidParams): RaidEvent {
  const cfg = params.config ?? DEFAULT_RAID_SCHEDULER_CONFIG;
  const upcomingLead = params.startImmediatelyInGathering ? 0 : cfg.upcomingLeadSec;
  const startTime = params.nowSec + upcomingLead + cfg.prepCountdownSec;
  const endTime = startTime + cfg.raidDurationSec;

  return {
    raidId: params.raidId,
    bossId: params.bossId,
    bossName: params.bossName,
    bossTitle: params.bossTitle,
    tier: params.tier,
    difficulty: difficultyForTier(params.tier),
    location: params.location,
    locationLabel: describeWorldRegion(params.location),
    createdAt: params.nowSec,
    prepDuration: cfg.prepCountdownSec,
    startTime,
    duration: cfg.raidDurationSec,
    endTime,
    minParticipants: params.minParticipants ?? 1,
    recommendedPartySize: params.recommendedPartySize ?? 4,
    maxParticipants: params.maxParticipants ?? 8,
    participants: [],
    status: params.startImmediatelyInGathering ? 'Gathering' : 'Upcoming',
    bossHp: params.bossMaxHp,
    bossMaxHp: params.bossMaxHp,
    bossPhase: 1,
    rewardTableId: params.rewardTableId,
    completionStatus: 'none',
  };
}

export function joinRaid(
  raid: RaidEvent,
  playerId: string,
  displayName: string,
  nowSec: number
): { joined: boolean; reason?: 'closed' | 'full' } {
  if (
    raid.status === 'Completed' ||
    raid.status === 'Failed' ||
    raid.status === 'Expired'
  ) {
    return { joined: false, reason: 'closed' };
  }

  // Reconnect existing participant without creating a duplicate
  const existing = raid.participants.find((p) => p.playerId === playerId);
  if (existing) {
    existing.isConnected = true;
    existing.displayName = displayName;
    return { joined: true };
  }

  if (raid.participants.length >= raid.maxParticipants) {
    return { joined: false, reason: 'full' };
  }

  const participant: RaidParticipant = {
    playerId,
    displayName,
    joinedAt: nowSec,
    ready: true,
    totalDamageDealt: 0,
    supportActions: 0,
    hitsLanded: 0,
    isConnected: true,
    rewardClaimed: false,
  };
  raid.participants.push(participant);
  return { joined: true };
}

export function leaveRaid(raid: RaidEvent, playerId: string): boolean {
  const before = raid.participants.length;
  raid.participants = raid.participants.filter((p) => p.playerId !== playerId);
  return raid.participants.length !== before;
}

export function canStartRaid(raid: RaidEvent, nowSec: number): boolean {
  if (raid.status !== 'Gathering' && raid.status !== 'Upcoming') return false;
  const connected = raid.participants.filter((p) => p.isConnected).length;
  return connected >= raid.minParticipants && nowSec >= raid.startTime;
}

export function forceStartGatheringRaid(raid: RaidEvent, nowSec: number): boolean {
  if (raid.status !== 'Gathering' && raid.status !== 'Upcoming') return false;
  const connected = raid.participants.filter((p) => p.isConnected).length;
  if (connected < raid.minParticipants) return false;
  raid.status = 'InProgress';
  raid.startTime = nowSec;
  raid.endTime = nowSec + raid.duration;
  return true;
}

export function stepRaidLifecycle(
  raid: RaidEvent,
  nowSec: number,
  config: RaidSchedulerConfig = DEFAULT_RAID_SCHEDULER_CONFIG
): void {
  if (
    raid.status === 'Completed' ||
    raid.status === 'Failed' ||
    raid.status === 'Expired'
  ) {
    return;
  }

  if (raid.bossHp <= 0) {
    raid.status = 'Completed';
    raid.completionStatus = 'victory';
    return;
  }

  const gatheringStart = raid.startTime - raid.prepDuration;
  if (raid.status === 'Scheduled' && nowSec >= gatheringStart - config.upcomingLeadSec) {
    raid.status = 'Upcoming';
  }
  if (raid.status === 'Upcoming' && nowSec >= gatheringStart) {
    raid.status = 'Gathering';
  }
  if (raid.status === 'Gathering' && nowSec >= raid.startTime) {
    const connected = raid.participants.filter((p) => p.isConnected).length;
    if (connected >= raid.minParticipants) {
      raid.status = 'InProgress';
    } else {
      raid.status = 'Expired';
      raid.completionStatus = 'expired';
      return;
    }
  }
  if (raid.status === 'InProgress' && nowSec >= raid.endTime) {
    raid.status = 'Failed';
    raid.completionStatus = 'defeat';
  }
}
