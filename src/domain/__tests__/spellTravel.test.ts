import { describe, expect, it } from 'vitest';
import {
  createOfflineSpellTravelEvent,
  evaluateTravelCurve,
  getTravelPhase,
  SPELL_WEAPON_POOL,
} from '../cards/spellTravel';
import { CARD_DEFINITIONS } from '../cards/types';
import { createStarterInventory } from '../cards/rules';

describe('Greed Island spell travel & summoning cards', () => {
  it('registers all five spell cards in CARD_DEFINITIONS and gives 1 copy of every card in starter inventory', () => {
    const ids = new Set(CARD_DEFINITIONS.map((c) => c.id));
    expect(ids.has('accompany')).toBe(true);
    expect(ids.has('magnetic_force')).toBe(true);
    expect(ids.has('return')).toBe(true);
    expect(ids.has('drift')).toBe(true);
    expect(ids.has('summon_weapon')).toBe(true);
    expect(SPELL_WEAPON_POOL).toEqual(['Sword', 'Greatsword', 'Spear', 'Axe', 'Dagger', 'Bow']);

    const starter = createStarterInventory();
    for (const def of CARD_DEFINITIONS) {
      expect(starter.cards[def.id]).toEqual({ cardId: def.id, level: 1, duplicates: 0 });
    }
  });

  it('transitions travel state machine from Preparing/Launching -> Transforming -> Flying -> Descending -> Arriving -> Completed', () => {
    const ev = createOfflineSpellTravelEvent(
      'return',
      'p1',
      { x: 0, y: 2.06, z: 0 },
      { x: 58, y: 4.2, z: -50, label: 'Crystal Peak' }
    );

    expect(getTravelPhase(ev, -10)).toBe('Preparing');
    expect(getTravelPhase(ev, 200)).toBe('Launching');
    expect(getTravelPhase(ev, 800)).toBe('Transforming');
    expect(getTravelPhase(ev, ev.launchDurationMs + 500)).toBe('Flying');
    expect(getTravelPhase(ev, ev.totalDurationMs - 600)).toBe('Descending');
    expect(getTravelPhase(ev, ev.totalDurationMs - 100)).toBe('Arriving');
    expect(getTravelPhase(ev, ev.totalDurationMs + 50)).toBe('Completed');
  });

  it('evaluates curved aerial 3D trajectory that rises vertically, flies above terrain, and lands at destination', () => {
    const ev = createOfflineSpellTravelEvent(
      'drift',
      'p1',
      { x: 0, y: 2.06, z: 0 },
      { x: -54, y: 2.0, z: -46, label: 'Ancient Ruins' }
    );

    const launchStart = evaluateTravelCurve(ev, 0, 0, 1);
    expect(launchStart.x).toBeCloseTo(0);
    expect(launchStart.y).toBeCloseTo(2.06);
    expect(launchStart.isTransformedRay).toBe(false);

    const midFlight = evaluateTravelCurve(ev, ev.launchDurationMs + ev.flightDurationMs * 0.5, 0, 1);
    expect(midFlight.y).toBeGreaterThan(20);
    expect(midFlight.isTransformedRay).toBe(true);

    const arrived = evaluateTravelCurve(ev, ev.totalDurationMs, 0, 1);
    expect(arrived.x).toBeCloseTo(-54);
    expect(arrived.y).toBeCloseTo(2.0);
    expect(arrived.z).toBeCloseTo(-46);
  });
});
