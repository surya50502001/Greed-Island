import { describe, expect, it } from 'vitest';
import {
  normalizeRoomCode,
  validateCharacterName,
  validateRoomCode,
} from '../multiplayer/validation';
import { resolveMultiplayerHubUrl } from '../../network/SignalRClient';

describe('multiplayer character identity and room validation', () => {
  it('rejects empty, whitespace-only, short, or invalid character names', () => {
    expect(validateCharacterName('').valid).toBe(false);
    expect(validateCharacterName('   ').valid).toBe(false);
    expect(validateCharacterName('AB').valid).toBe(false);
    expect(validateCharacterName('TooLongCharacterName123').valid).toBe(false);
    expect(validateCharacterName('<script>').valid).toBe(false);
  });

  it('trims and accepts valid character names', () => {
    const res1 = validateCharacterName('  KAI  ');
    expect(res1.valid).toBe(true);
    expect(res1.normalized).toBe('KAI');

    const res2 = validateCharacterName('Itachi_01');
    expect(res2.valid).toBe(true);
    expect(res2.normalized).toBe('Itachi_01');
  });

  it('normalizes and validates 6-character room codes', () => {
    expect(normalizeRoomCode(' ab12cd ')).toBe('AB12CD');
    expect(validateRoomCode('gi4k9p').valid).toBe(true);
    expect(validateRoomCode('ABC').valid).toBe(false);
    expect(validateRoomCode('AB-123').valid).toBe(false);
  });

  it('uses localhost only in dev and requires VITE_MULTIPLAYER_URL in production', () => {
    expect(resolveMultiplayerHubUrl(undefined, true)).toBe('http://localhost:5000/hubs/game');
    expect(resolveMultiplayerHubUrl(undefined, false)).toBeNull();
    expect(resolveMultiplayerHubUrl('https://api.example.com/hubs/game', false)).toBe(
      'https://api.example.com/hubs/game'
    );
  });
});
