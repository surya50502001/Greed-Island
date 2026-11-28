import { describe, expect, it } from 'vitest';
import {
  getSlotIndexForAction,
  isTouchControlPreferred,
  PC_TO_MOBILE_CONTROLS,
  resolveKeyboardGameAction,
} from '../input/controls';
import { CharacterController } from '../../gameplay/character/CharacterController';

describe('unified PC-to-mobile controls and device detection', () => {
  it('defines a mobile equivalent for every PC control action', () => {
    const actions = new Set(PC_TO_MOBILE_CONTROLS.map((entry) => entry.action));
    expect(actions.has('move')).toBe(true);
    expect(actions.has('sprint')).toBe(true);
    expect(actions.has('jump')).toBe(true);
    expect(actions.has('descend')).toBe(true);
    expect(actions.has('attack')).toBe(true);
    expect(actions.has('block')).toBe(true);
    expect(actions.has('dodge')).toBe(true);
    expect(actions.has('toggleGrimoire')).toBe(true);
    expect(actions.has('toggleMap')).toBe(true);
    expect(actions.has('activateSlot1')).toBe(true);
    expect(actions.has('activateSlot2')).toBe(true);
    expect(actions.has('activateSlot3')).toBe(true);
    expect(actions.has('activateSlot4')).toBe(true);
    expect(actions.has('revive')).toBe(true);
    expect(actions.has('closeOverlay')).toBe(true);

    for (const entry of PC_TO_MOBILE_CONTROLS) {
      expect(entry.pcInput.trim().length).toBeGreaterThan(0);
      expect(entry.mobileEquivalent.trim().length).toBeGreaterThan(0);
    }
  });

  it('detects touch-capable devices and responsive viewports without breaking desktop', () => {
    expect(
      isTouchControlPreferred({
        pointerCoarse: false,
        maxTouchPoints: 0,
        hasTouchEvent: false,
        viewportWidth: 1440,
      })
    ).toBe(false);

    expect(
      isTouchControlPreferred({
        pointerCoarse: true,
        maxTouchPoints: 5,
        hasTouchEvent: true,
        viewportWidth: 844,
      })
    ).toBe(true);

    expect(
      isTouchControlPreferred({
        pointerCoarse: false,
        maxTouchPoints: 10,
        hasTouchEvent: false,
        viewportWidth: 1366,
      })
    ).toBe(true);

    expect(
      isTouchControlPreferred({
        pointerCoarse: false,
        maxTouchPoints: 0,
        hasTouchEvent: false,
        viewportWidth: 768,
      })
    ).toBe(true);
  });

  it('resolves PC keyboard shortcuts to unified GameActionId values', () => {
    expect(resolveKeyboardGameAction('KeyG', false, false, false)).toBe('toggleGrimoire');
    expect(resolveKeyboardGameAction('KeyM', false, false, false)).toBe('toggleMap');
    expect(resolveKeyboardGameAction('Escape', false, true, false)).toBe('closeOverlay');
    expect(resolveKeyboardGameAction('Digit1', false, false, false)).toBe('activateSlot1');
    expect(resolveKeyboardGameAction('Digit4', false, false, false)).toBe('activateSlot4');
    expect(resolveKeyboardGameAction('Digit1', false, true, false)).toBeNull();
    expect(resolveKeyboardGameAction('KeyG', true, false, false)).toBeNull();
    expect(resolveKeyboardGameAction('KeyR', true, false, false)).toBe('revive');

    expect(getSlotIndexForAction('activateSlot1')).toBe(0);
    expect(getSlotIndexForAction('activateSlot4')).toBe(3);
    expect(getSlotIndexForAction('toggleMap')).toBeNull();
  });

  it('drives CharacterController with touch joystick, sprint, attack, dodge, and clean release', () => {
    const ctrl = new CharacterController(0, 0);

    // Diagonal joystick movement + sprint
    ctrl.setTouchMove(0.7, 0.7);
    ctrl.setTouchAction('sprint', true);
    const stepMove = ctrl.update(0.016, 0, 0.2, false, false, false, 1);
    expect(stepMove.horizSpeed).toBeGreaterThan(0);

    // Attack with weapon summoned
    expect(ctrl.triggerAttack(true, false)).toBe(true);
    const stepAttack = ctrl.update(0.016, 0, 0.2, false, true, false, 1);
    expect(stepAttack.comboStep).toBe(1);

    // Release all inputs cleanly (prevents stuck movement/actions)
    ctrl.clearInputs();
    const stepCleared = ctrl.update(0.016, 0, 0.2, false, true, false, 1);
    expect(stepCleared.isBlocking).toBe(false);
  });
});
