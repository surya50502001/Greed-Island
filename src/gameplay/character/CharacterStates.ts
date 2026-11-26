export const DEFAULT_CHARACTER_MODEL_URL = '/models/human.glb';

export type CharacterLocomotionState =
  | 'Idle'
  | 'StartMoving'
  | 'StopMoving'
  | 'Walk'
  | 'Jog'
  | 'Sprint'
  | 'WalkBackward'
  | 'StrafeLeft'
  | 'StrafeRight'
  | 'JumpStart'
  | 'JumpLoop'
  | 'Fall'
  | 'Land'
  | 'CombatIdle'
  | 'Attack'
  | 'Block'
  | 'Dodge'
  | 'HitReaction'
  | 'Death'
  | 'FlightTakeoff'
  | 'FlightHover'
  | 'FlightForward'
  | 'FlightAscend'
  | 'FlightDescend'
  | 'FlightLand';

export interface ClipResolution {
  clipName: string | null;
  isNativeClip: boolean;
  reverse?: boolean;
  loopOnce?: boolean;
}

/**
 * Candidate clip names per state so a full-featured humanoid GLB
 * (e.g. Mixamo / Blender export at public/models/adventurer.glb)
 * automatically binds native clips.
 */
export const STATE_CLIP_CANDIDATES: Record<CharacterLocomotionState, string[]> = {
  Idle: ['Idle', 'idle', 'Armature|Armature|mixamo.com|Layer0.001'],
  StartMoving: ['StartMoving', 'Start_Walk', 'WalkStart'],
  StopMoving: ['StopMoving', 'Stop_Walk', 'WalkStop'],
  Walk: ['Walk', 'walk'],
  Jog: ['Jog', 'Run', 'run'],
  Sprint: ['Sprint', 'Run', 'run'],
  WalkBackward: ['WalkBackward', 'Walk_Back', 'Backwards'],
  StrafeLeft: ['StrafeLeft', 'Strafe_Left', 'LeftStrafe'],
  StrafeRight: ['StrafeRight', 'Strafe_Right', 'RightStrafe'],
  JumpStart: ['JumpStart', 'Jump_Start', 'Jump'],
  JumpLoop: ['JumpLoop', 'Jump_Loop', 'Jump'],
  Fall: ['Fall', 'Falling', 'InAir'],
  Land: ['Land', 'Landing'],
  CombatIdle: ['CombatIdle', 'SwordIdle'],
  Attack: ['Attack', 'SwordSlash', 'Slash'],
  Block: ['Block', 'SwordBlock', 'Guard'],
  Dodge: ['Dodge', 'Roll', 'Evade'],
  HitReaction: ['HitReaction', 'Hit', 'Damage'],
  Death: ['Death', 'Die'],
  FlightTakeoff: ['FlightTakeoff', 'Takeoff'],
  FlightHover: ['FlightHover', 'Hover'],
  FlightForward: ['FlightForward', 'Fly'],
  FlightAscend: ['FlightAscend', 'FlyUp'],
  FlightDescend: ['FlightDescend', 'FlyDown'],
  FlightLand: ['FlightLand', 'Land'],
};

const ONE_SHOT_STATES = new Set<CharacterLocomotionState>([
  'StartMoving',
  'StopMoving',
  'JumpStart',
  'Land',
  'Attack',
  'Dodge',
  'HitReaction',
  'Death',
  'FlightTakeoff',
  'FlightLand',
]);

export function resolveClipForState(
  state: CharacterLocomotionState,
  availableClips: string[]
): ClipResolution {
  const candidates = STATE_CLIP_CANDIDATES[state];
  const loopOnce = ONE_SHOT_STATES.has(state);

  for (const candidate of candidates) {
    if (availableClips.includes(candidate)) {
      return { clipName: candidate, isNativeClip: true, loopOnce };
    }
  }

  // Minimal fallback for Soldier.glb (Idle, Walk, Run, TPose)
  switch (state) {
    case 'WalkBackward':
      if (availableClips.includes('Walk')) {
        return { clipName: 'Walk', isNativeClip: false, reverse: true };
      }
      break;
    case 'StartMoving':
    case 'StopMoving':
    case 'StrafeLeft':
    case 'StrafeRight':
      if (availableClips.includes('Walk')) {
        return { clipName: 'Walk', isNativeClip: false };
      }
      break;
    case 'Jog':
    case 'Sprint':
      if (availableClips.includes('Run')) {
        return { clipName: 'Run', isNativeClip: false };
      }
      break;
    default:
      if (availableClips.includes('Idle')) {
        return { clipName: 'Idle', isNativeClip: false };
      }
      if (availableClips.length > 0) {
        return { clipName: availableClips[0], isNativeClip: false };
      }
      break;
  }

  return { clipName: availableClips[0] ?? null, isNativeClip: false };
}

export function getMissingStatesForClips(availableClips: string[]): CharacterLocomotionState[] {
  return (Object.keys(STATE_CLIP_CANDIDATES) as CharacterLocomotionState[]).filter(
    (state) => !resolveClipForState(state, availableClips).isNativeClip
  );
}
