import { ActiveCardSlotIndex } from '../cards/types';

export type GameActionId =
  | 'move'
  | 'sprint'
  | 'jump'
  | 'descend'
  | 'attack'
  | 'block'
  | 'dodge'
  | 'toggleGrimoire'
  | 'toggleMap'
  | 'activateSlot1'
  | 'activateSlot2'
  | 'activateSlot3'
  | 'activateSlot4'
  | 'revive'
  | 'closeOverlay';

export interface ControlMappingEntry {
  action: GameActionId;
  pcInput: string;
  description: string;
  mobileEquivalent: string;
}

export const PC_TO_MOBILE_CONTROLS: readonly ControlMappingEntry[] = [
  {
    action: 'move',
    pcInput: 'W A S D / Arrow Keys',
    description: 'Walk, strafe, backpedal, or steer flight',
    mobileEquivalent: 'Left-thumb Virtual Joystick (360° + diagonal)',
  },
  {
    action: 'sprint',
    pcInput: 'Shift (Hold)',
    description: 'Sprint on ground or boost flight speed',
    mobileEquivalent: 'Sprint toggle button',
  },
  {
    action: 'jump',
    pcInput: 'Space',
    description: 'Jump on ground or ascend while flying',
    mobileEquivalent: 'Jump / Ascend button (hold to ascend)',
  },
  {
    action: 'descend',
    pcInput: 'C (Hold)',
    description: 'Descend while flying',
    mobileEquivalent: 'Descend button (shown while flying)',
  },
  {
    action: 'attack',
    pcInput: 'Left Mouse Click',
    description: 'Basic attack & 4-hit sword combo (PvE & PvP)',
    mobileEquivalent: 'Attack button (when weapon summoned)',
  },
  {
    action: 'block',
    pcInput: 'F (Hold)',
    description: 'Guard / Block incoming attacks',
    mobileEquivalent: 'Block hold button (when weapon summoned & grounded)',
  },
  {
    action: 'dodge',
    pcInput: 'Q',
    description: 'Quick evade / dodge roll',
    mobileEquivalent: 'Dodge button (when grounded)',
  },
  {
    action: 'toggleGrimoire',
    pcInput: 'G',
    description: 'Open or close Grimoire card book',
    mobileEquivalent: 'Book (Grimoire) button',
  },
  {
    action: 'toggleMap',
    pcInput: 'M',
    description: 'Open or close Island Map & Raids',
    mobileEquivalent: 'Map button',
  },
  {
    action: 'activateSlot1',
    pcInput: '1',
    description: 'Activate Active Card Slot 1 (e.g. Flight)',
    mobileEquivalent: 'Quick Card Slot 1 button',
  },
  {
    action: 'activateSlot2',
    pcInput: '2',
    description: 'Activate Active Card Slot 2 (e.g. Weapon)',
    mobileEquivalent: 'Quick Card Slot 2 button',
  },
  {
    action: 'activateSlot3',
    pcInput: '3',
    description: 'Activate Active Card Slot 3 (e.g. Invisibility)',
    mobileEquivalent: 'Quick Card Slot 3 button',
  },
  {
    action: 'activateSlot4',
    pcInput: '4',
    description: 'Activate Active Card Slot 4',
    mobileEquivalent: 'Quick Card Slot 4 button',
  },
  {
    action: 'revive',
    pcInput: 'R (when defeated)',
    description: 'Revive at Starting Plaza',
    mobileEquivalent: 'Revive at Starting Plaza button',
  },
  {
    action: 'closeOverlay',
    pcInput: 'Esc',
    description: 'Close Grimoire or Island Map',
    mobileEquivalent: 'Close / Book / Map button',
  },
] as const;

export interface TouchDeviceEnv {
  pointerCoarse: boolean;
  maxTouchPoints: number;
  hasTouchEvent: boolean;
  viewportWidth: number;
}

export function readTouchDeviceEnv(): TouchDeviceEnv {
  if (typeof window === 'undefined') {
    return {
      pointerCoarse: false,
      maxTouchPoints: 0,
      hasTouchEvent: false,
      viewportWidth: 1280,
    };
  }

  return {
    pointerCoarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0,
    hasTouchEvent: 'ontouchstart' in window,
    viewportWidth: window.innerWidth,
  };
}

/**
 * Determines whether touch controls should activate automatically.
 * Uses pointer/touch capabilities and responsive width rather than UA sniffing.
 */
export function isTouchControlPreferred(env: TouchDeviceEnv = readTouchDeviceEnv()): boolean {
  return (
    env.pointerCoarse ||
    env.maxTouchPoints > 0 ||
    env.hasTouchEvent ||
    env.viewportWidth <= 900
  );
}

/**
 * Maps global PC keyboard shortcuts (in App.tsx) to unified GameActionId values.
 */
export function resolveKeyboardGameAction(
  code: string,
  isDead: boolean,
  isGrimoireOpen: boolean,
  isMapOpen: boolean
): GameActionId | null {
  if (isDead) {
    return code === 'KeyR' ? 'revive' : null;
  }
  if (code === 'KeyG') return 'toggleGrimoire';
  if (code === 'KeyM') return 'toggleMap';
  if (code === 'Escape') return 'closeOverlay';
  if (isGrimoireOpen || isMapOpen) return null;

  switch (code) {
    case 'Digit1':
      return 'activateSlot1';
    case 'Digit2':
      return 'activateSlot2';
    case 'Digit3':
      return 'activateSlot3';
    case 'Digit4':
      return 'activateSlot4';
    default:
      return null;
  }
}

export function getSlotIndexForAction(action: GameActionId): ActiveCardSlotIndex | null {
  switch (action) {
    case 'activateSlot1':
      return 0;
    case 'activateSlot2':
      return 1;
    case 'activateSlot3':
      return 2;
    case 'activateSlot4':
      return 3;
    default:
      return null;
  }
}
