import { describe, expect, it } from 'vitest';
import {
  applyWorldDamage,
  mergeWorldPlayers,
  removeWorldPlayer,
  SharedWorldPlayer,
  upsertWorldPlayer,
  validateCharacterName,
} from '../multiplayer/validation';
import { resolveMultiplayerHubUrl } from '../../network/SignalRClient';

const makePlayer = (overrides: Partial<SharedWorldPlayer> = {}): SharedWorldPlayer => ({
  playerId: 'player-1',
  characterName: 'Gon',
  x: 0,
  y: 2.06,
  z: 2.6,
  yaw: 0,
  locomotionState: 'Idle',
  horizSpeed: 0,
  isFlying: false,
  hasWeapon: false,
  isInvisible: false,
  comboStep: 0,
  currentHealth: 100,
  maxHealth: 100,
  isAlive: true,
  timestampMs: 1000,
  ...overrides,
});

describe('multiplayer shared-world validation & state helpers', () => {
  it('validates and trims character names', () => {
    expect(validateCharacterName('  Gon  ')).toEqual({ valid: true, normalized: 'Gon' });
    expect(validateCharacterName('   ').valid).toBe(false);
    expect(validateCharacterName('ab').valid).toBe(false);
    expect(validateCharacterName('NameExceedingSixteenChars').valid).toBe(false);
    expect(validateCharacterName('Gon!@#').valid).toBe(false);
  });

  it('resolves SignalR hub URL for dev and production', () => {
    expect(resolveMultiplayerHubUrl('  https://greed-island.onrender.com/hubs/game  ', false)).toBe(
      'https://greed-island.onrender.com/hubs/game'
    );
    expect(resolveMultiplayerHubUrl(undefined, true)).toBe('http://localhost:5000/hubs/game');
    expect(resolveMultiplayerHubUrl(undefined, false)).toBeNull();
  });

  it('upserts, deduplicates, damages, respawns, and removes world players', () => {
    const p1 = makePlayer({ playerId: 'p1', characterName: 'Gon' });
    const p2 = makePlayer({ playerId: 'p2', characterName: 'Killua', x: 2.6, z: 0 });

    let players = upsertWorldPlayer([], p1);
    players = upsertWorldPlayer(players, p2);
    expect(players).toHaveLength(2);

    // Deduplicate on reconnect/update
    players = upsertWorldPlayer(players, makePlayer({ playerId: 'p1', characterName: 'Gon', x: 5 }));
    expect(players).toHaveLength(2);
    expect(players.find((p) => p.playerId === 'p1')?.x).toBe(5);

    // Apply server-authoritative PvP damage & death
    players = applyWorldDamage(players, 'p2', 0, 100, false);
    expect(players.find((p) => p.playerId === 'p2')?.currentHealth).toBe(0);
    expect(players.find((p) => p.playerId === 'p2')?.isAlive).toBe(false);

    // Respawn via upsertWorldPlayer
    players = upsertWorldPlayer(players, makePlayer({ playerId: 'p2', characterName: 'Killua', currentHealth: 100, isAlive: true }));
    expect(players.find((p) => p.playerId === 'p2')?.isAlive).toBe(true);
    expect(players.find((p) => p.playerId === 'p2')?.currentHealth).toBe(100);

    // Remove on disconnect
    players = removeWorldPlayer(players, 'p1');
    expect(players).toHaveLength(1);
    expect(players[0].playerId).toBe('p2');
  });

  it('merges initial EnterWorld snapshot with in-flight PlayerJoined events without losing or duplicating players', () => {
    const kai = makePlayer({ playerId: 'p-kai', characterName: 'KAI', timestampMs: 100 });
    const itachiLive = makePlayer({ playerId: 'p-itachi', characterName: 'itachi', timestampMs: 250 });
    const gon = makePlayer({ playerId: 'p-gon', characterName: 'Gon', timestampMs: 200 });

    // Simulate itachi arriving via PlayerJoined before KAI's EnterWorld response resolves
    const merged = mergeWorldPlayers([itachiLive], [kai, gon], 'p-kai');
    expect(merged.map((p) => p.playerId).sort()).toEqual(['p-gon', 'p-itachi', 'p-kai'].sort());
    expect(merged.find((p) => p.playerId === 'p-itachi')?.timestampMs).toBe(250);
  });
});
