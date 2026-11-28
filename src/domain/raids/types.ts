import { Vec3 } from '../math/vec3';

export type RaidTier = 1 | 2 | 3 | 4 | 5;

export type RaidDifficulty = 'Normal' | 'Hard' | 'Heroic' | 'Mythic';

export type RaidStatus =
  | 'Scheduled'
  | 'Upcoming'
  | 'Gathering'
  | 'InProgress'
  | 'Completed'
  | 'Failed'
  | 'Expired';

export interface RaidParticipant {
  playerId: string;
  displayName: string;
  joinedAt: number;
  ready: boolean;
  totalDamageDealt: number;
  supportActions: number;
  hitsLanded: number;
  isConnected: boolean;
  rewardClaimed: boolean;
}

export interface RaidEvent {
  raidId: string;
  bossId: string;
  bossName: string;
  bossTitle: string;
  tier: RaidTier;
  difficulty: RaidDifficulty;
  location: Vec3;
  locationLabel: string;
  createdAt: number;
  prepDuration: number;
  startTime: number;
  duration: number;
  endTime: number;
  minParticipants: number;
  recommendedPartySize: number;
  maxParticipants: number;
  participants: RaidParticipant[];
  status: RaidStatus;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  rewardTableId: string;
  completionStatus: 'none' | 'victory' | 'defeat' | 'expired';
}

export interface RaidSchedulerConfig {
  minIntervalSec: number;
  maxIntervalSec: number;
  upcomingLeadSec: number;
  prepCountdownSec: number;
  raidDurationSec: number;
  maxSimultaneousRaids: number;
  minDistanceBetweenRaids: number;
  minHeightAboveWater: number;
  maxTerrainSlope: number;
  minDistanceFromLandmarkCenter: number;
  tierProbabilities: Record<RaidTier, number>;
}

export const DEFAULT_RAID_SCHEDULER_CONFIG: RaidSchedulerConfig = {
  minIntervalSec: 150,
  maxIntervalSec: 270,
  upcomingLeadSec: 8,
  prepCountdownSec: 25,
  raidDurationSec: 180,
  maxSimultaneousRaids: 2,
  minDistanceBetweenRaids: 55,
  minHeightAboveWater: 1.8,
  maxTerrainSlope: 0.72,
  minDistanceFromLandmarkCenter: 10,
  tierProbabilities: {
    1: 0.2,
    2: 0.3,
    3: 0.28,
    4: 0.15,
    5: 0.07,
  },
};
