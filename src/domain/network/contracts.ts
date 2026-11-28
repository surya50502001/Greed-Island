import { AnyCardId, TradeOffer } from '../cards/types';
import { ComboStep } from '../combat/rules';
import { EnemyAIState, EnemySpecies } from '../enemies/types';
import { Vec3 } from '../math/vec3';
import { BossAIState } from '../bosses/types';
import { RaidDifficulty, RaidStatus, RaidTier } from '../raids/types';

export interface PlayerInputSnapshot {
  seq: number;
  timestamp: number;
  forward: number;
  strafe: number;
  sprint: boolean;
  jump: boolean;
  descend: boolean;
  block: boolean;
  camYaw: number;
  camPitch: number;
}

export interface PlayerStateSnapshot {
  playerId: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  isDead: boolean;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  isBlocking: boolean;
  comboStep: ComboStep;
  locomotionState: string;
}

export interface EnemyStateSnapshot {
  id: string;
  species: EnemySpecies;
  aiState: EnemyAIState;
  position: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  chasing: boolean;
}

export interface WorldSnapshot {
  serverTime: number;
  tick: number;
  players: PlayerStateSnapshot[];
  enemies: EnemyStateSnapshot[];
}

export interface CombatAttackCommand {
  playerId: string;
  seq: number;
  comboStep: 1 | 2 | 3 | 4;
  yaw: number;
}

export interface CardActivateCommand {
  playerId: string;
  cardId: AnyCardId;
  slotIndex: 0 | 1 | 2 | 3;
}

export interface TradeRequestCommand {
  offer: TradeOffer;
}

export interface TradeResponseEvent {
  tradeId: string;
  accepted: boolean;
  reason?: string;
}

export interface RaidSnapshot {
  raidId: string;
  bossId: string;
  tier: RaidTier;
  difficulty: RaidDifficulty;
  location: Vec3;
  status: RaidStatus;
  startTime: number;
  endTime: number;
  participantCount: number;
  maxParticipants: number;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: 1 | 2 | 3;
}

export interface BossEncounterSnapshot {
  raidId: string;
  bossId: string;
  position: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  aiState: BossAIState;
  activeAbilityId: string | null;
  telegraphCenter: Vec3;
  telegraphRadius: number;
  telegraphRemaining: number;
  shieldHp: number;
  weakPointExposed: boolean;
}

export interface JoinRaidCommand {
  playerId: string;
  raidId: string;
}

export interface LeaveRaidCommand {
  playerId: string;
  raidId: string;
}

export interface ClaimRaidRewardCommand {
  playerId: string;
  raidId: string;
}
