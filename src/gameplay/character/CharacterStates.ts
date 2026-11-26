export const DEFAULT_CHARACTER_MODEL_URL =
  'https://threejs.org/examples/models/gltf/Soldier.glb';

export type CharacterLocomotionState =
  | 'Idle'
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
  | 'HitReaction'
  | 'Death'
  | 'FlightTakeoff'
  | 'FlightHover'
  | 'FlightForward'
  | 'FlightLand';

export interface ClipResolution {
  clipName: string;
  isNativeClip: boolean;
  reverse?: boolean;
  loopOnce?: boolean;
}

/**
 * Candidate clip names per state so a full-featured humanoid GLB
 * automatically uses native clips, while Soldier.glb (Idle, Walk, Run, TPose)
 * falls back honestly to its closest available clip.
 */
const STATE_CLIP_CANDIDATES: Record<CharacterLocomotionState, string[]> = {
  Idle: ['Idle', 'idle'],
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
  CombatIdle: ['CombatIdle', 'SwordIdle', 'Idle'],
  Attack: ['Attack', 'SwordSlash', 'Slash'],
  HitReaction: ['HitReaction', 'Hit', 'Damage'],
  Death: ['Death', 'Die'],
  FlightTakeoff: ['FlightTakeoff', 'Takeoff'],
  FlightHover: ['FlightHover', 'Hover'],
  FlightForward: ['FlightForward', 'Fly'],
  FlightLand: ['FlightLand', 'Land'],
};

const ONE_SHOT_STATES = new Set<CharacterLocomotionState>([
  'JumpStart',
  'Land',
  'Attack',
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

  // Honest fallbacks for minimal GLBs such as Soldier.glb (Idle, Walk, Run, TPose)
  switch (state) {
    case 'WalkBackward':
      if (availableClips.includes('Walk')) {
        return { clipName: 'Walk', isNativeClip: false, reverse: true };
      }
      break;
    case 'StrafeLeft':
    case 'StrafeRight':
      if (availableClips.includes('Walk')) {
        return { clipName: 'Walk', isNativeClip: false };
      }
      break;
    case 'Sprint':
    case 'Jog':
      if (availableClips.includes('Run')) {
        return { clipName: 'Run', isNativeClip: false };
      }
      break;
    case 'FlightForward':
      if (availableClips.includes('Idle')) {
        return { clipName: 'Idle', isNativeClip: false };
      }
      break;
    case 'JumpStart':
    case 'JumpLoop':
    case 'Fall':
    case 'Land':
    case 'CombatIdle':
    case 'Attack':
    case 'HitReaction':
    case 'Death':
    case 'FlightTakeoff':
    case 'FlightHover':
    case 'FlightLand':
      if (availableClips.includes('Idle')) {
        return { clipName: 'Idle', isNativeClip: false };
      }
      break;
  }

  return { clipName: availableClips[0] ?? 'Idle', isNativeClip: false };
}
