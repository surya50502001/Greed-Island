import { LANDMARKS } from '../world/island';

export type SpellTravelCardId = 'accompany' | 'magnetic_force' | 'return' | 'drift';
export type SpellWeaponType = 'Sword' | 'Greatsword' | 'Spear' | 'Axe' | 'Dagger' | 'Bow';

export const SPELL_WEAPON_POOL: readonly SpellWeaponType[] = [
  'Sword',
  'Greatsword',
  'Spear',
  'Axe',
  'Dagger',
  'Bow',
] as const;

export type TravelPhase =
  | 'Idle'
  | 'Preparing'
  | 'Launching'
  | 'Transforming'
  | 'Flying'
  | 'Descending'
  | 'Arriving'
  | 'Completed';

export interface WorldTown {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface MetPlayerSummary {
  playerId: string;
  characterName: string;
  isOnline: boolean;
}

export interface SpellTravelContext {
  visitedTownIds: string[];
  metPlayers: MetPlayerSummary[];
  allTowns: WorldTown[];
}

export interface SpellTravelEvent {
  eventId: string;
  cardId: SpellTravelCardId;
  casterPlayerId: string;
  participantPlayerIds: string[];
  originX: number;
  originY: number;
  originZ: number;
  destinationX: number;
  destinationY: number;
  destinationZ: number;
  destinationLabel: string;
  targetPlayerId?: string | null;
  startTimestampMs: number;
  launchDurationMs: number;
  flightDurationMs: number;
  descendDurationMs: number;
  totalDurationMs: number;
  pathSeed: number;
  arcHeight: number;
  curveOffset: number;
  localStartPerfMs?: number;
}

export interface SpellTravelResult {
  success: boolean;
  error?: string;
  travelEvent?: SpellTravelEvent;
}

export interface AccompanyInvite {
  inviteId: string;
  leaderPlayerId: string;
  leaderName: string;
  destinationLabel: string;
  expiresAtMs: number;
}

export interface WeaponSummonEvent {
  eventId: string;
  playerId: string;
  weaponType: SpellWeaponType;
  startTimestampMs: number;
  durationMs: number;
  localStartPerfMs?: number;
}

export interface WeaponSummonResult {
  success: boolean;
  error?: string;
  summonEvent?: WeaponSummonEvent;
}

export interface TravelCurveSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  phase: TravelPhase;
  phaseProgress: number;
  isTransformedRay: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getTravelPhase(ev: SpellTravelEvent, elapsedMs: number): TravelPhase {
  if (elapsedMs < 0) return 'Preparing';
  if (elapsedMs < ev.launchDurationMs * 0.55) return 'Launching';
  if (elapsedMs < ev.launchDurationMs) return 'Transforming';
  if (elapsedMs < ev.launchDurationMs + ev.flightDurationMs) return 'Flying';
  if (elapsedMs < ev.totalDurationMs - 320) return 'Descending';
  if (elapsedMs < ev.totalDurationMs) return 'Arriving';
  return 'Completed';
}

/**
 * Deterministic 3D curved flight evaluator shared by local player, remote players,
 * and all observers so everyone sees the exact same aerial trajectory.
 */
export function evaluateTravelCurve(
  ev: SpellTravelEvent,
  elapsedMs: number,
  participantIndex = 0,
  totalParticipants = 1
): TravelCurveSample {
  const phase = getTravelPhase(ev, elapsedMs);
  const clamped = Math.max(0, Math.min(ev.totalDurationMs, elapsedMs));

  // Formation offset for Accompany group flights
  const formAngle = (participantIndex / Math.max(1, totalParticipants)) * Math.PI * 2;
  const formSpread = totalParticipants > 1 ? 1.5 : 0;
  const formX = Math.cos(formAngle) * formSpread;
  const formZ = Math.sin(formAngle) * formSpread;

  const ox = ev.originX + formX * 0.6;
  const oy = ev.originY;
  const oz = ev.originZ + formZ * 0.6;
  const dx = ev.destinationX + formX;
  const dy = ev.destinationY;
  const dz = ev.destinationZ + formZ;

  const cruiseY = Math.max(oy, dy) + ev.arcHeight;
  const dirX = dx - ox;
  const dirZ = dz - oz;
  const horizLen = Math.hypot(dirX, dirZ);
  const perpX = horizLen > 0.01 ? -dirZ / horizLen : 1;
  const perpZ = horizLen > 0.01 ? dirX / horizLen : 0;
  const yawToDest = Math.atan2(dirX, dirZ);

  if (clamped <= ev.launchDurationMs) {
    const t = clamp01(clamped / Math.max(1, ev.launchDurationMs));
    const rise = easeInOutCubic(t);
    return {
      x: ox,
      y: oy + (cruiseY - oy) * rise,
      z: oz,
      yaw: yawToDest,
      pitch: 0.9 * rise,
      phase,
      phaseProgress: t,
      isTransformedRay: t >= 0.45,
    };
  }

  const flightStart = ev.launchDurationMs;
  const flightEnd = flightStart + ev.flightDurationMs;

  if (clamped <= flightEnd) {
    const t = clamp01((clamped - flightStart) / Math.max(1, ev.flightDurationMs));
    const eased = easeInOutCubic(t);
    const arcLift = Math.sin(t * Math.PI) * (ev.cardId === 'drift' ? 12 : 7);

    // Drift weaves unpredictably along an S-curve; others use a graceful single arc
    const lateral =
      ev.cardId === 'drift'
        ? Math.sin(t * Math.PI * 2.5 + (ev.pathSeed % 7)) * ev.curveOffset * Math.sin(t * Math.PI)
        : Math.sin(t * Math.PI) * ev.curveOffset;

    const x = ox + dirX * eased + perpX * lateral;
    const z = oz + dirZ * eased + perpZ * lateral;
    const y = cruiseY + arcLift;

    const nextT = clamp01(t + 0.02);
    const nextEased = easeInOutCubic(nextT);
    const nextLat =
      ev.cardId === 'drift'
        ? Math.sin(nextT * Math.PI * 2.5 + (ev.pathSeed % 7)) * ev.curveOffset * Math.sin(nextT * Math.PI)
        : Math.sin(nextT * Math.PI) * ev.curveOffset;
    const nx = ox + dirX * nextEased + perpX * nextLat;
    const nz = oz + dirZ * nextEased + perpZ * nextLat;

    return {
      x,
      y,
      z,
      yaw: Math.atan2(nx - x, nz - z),
      pitch: 0.12,
      phase,
      phaseProgress: t,
      isTransformedRay: true,
    };
  }

  const descT = clamp01((clamped - flightEnd) / Math.max(1, ev.descendDurationMs));
  const drop = easeInOutCubic(descT);
  return {
    x: dx,
    y: cruiseY + (dy - cruiseY) * drop,
    z: dz,
    yaw: yawToDest,
    pitch: -0.85 * (1 - drop),
    phase,
    phaseProgress: descT,
    isTransformedRay: descT < 0.72,
  };
}

export function getOfflineTowns(): WorldTown[] {
  return LANDMARKS.map((lm) => ({
    id: lm.name.toLowerCase().replace(/\s+/g, '_'),
    name: lm.name,
    x: lm.x,
    y: lm.name === 'Starting Plaza' ? 2.06 : 2.0,
    z: lm.z,
    radius: lm.radius,
  }));
}

export function createOfflineSpellTravelEvent(
  cardId: SpellTravelCardId,
  casterPlayerId: string,
  origin: { x: number; y: number; z: number },
  destination: { x: number; y: number; z: number; label: string }
): SpellTravelEvent {
  const dist = Math.hypot(destination.x - origin.x, destination.z - origin.z);
  const launchDurationMs = 1100;
  const descendDurationMs = 1100;
  const flightDurationMs =
    cardId === 'drift'
      ? Math.max(2600, Math.min(5400, Math.round(2400 + dist * 22)))
      : Math.max(2000, Math.min(4400, Math.round(1800 + dist * 16)));
  const seed = Math.floor(Math.random() * 900000) + 1000;
  return {
    eventId: `offline-${Date.now()}-${seed}`,
    cardId,
    casterPlayerId,
    participantPlayerIds: [casterPlayerId],
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
    destinationX: destination.x,
    destinationY: destination.y,
    destinationZ: destination.z,
    destinationLabel: destination.label,
    startTimestampMs: Date.now(),
    launchDurationMs,
    flightDurationMs,
    descendDurationMs,
    totalDurationMs: launchDurationMs + flightDurationMs + descendDurationMs,
    pathSeed: seed,
    arcHeight: cardId === 'drift' ? 28 : Math.max(18, Math.min(34, 18 + dist * 0.14)),
    curveOffset: cardId === 'drift' ? 18 : Math.max(4, Math.min(14, dist * 0.12)),
    localStartPerfMs: performance.now(),
  };
}
