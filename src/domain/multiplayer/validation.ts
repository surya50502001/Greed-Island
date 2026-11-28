const VALID_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;

export interface ValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export function validateCharacterName(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, normalized: '', error: 'Character name is required.' };
  }
  if (trimmed.length < 3 || trimmed.length > 16) {
    return {
      valid: false,
      normalized: '',
      error: 'Character name must be 3 to 16 characters.',
    };
  }
  if (!VALID_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      error: "Use only letters, numbers, spaces, '-' or '_'.",
    };
  }
  return { valid: true, normalized: trimmed };
}

export interface SharedWorldPlayer {
  playerId: string;
  characterName: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  locomotionState: string;
  horizSpeed: number;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  comboStep: number;
  currentHealth: number;
  maxHealth: number;
  isAlive: boolean;
  timestampMs: number;
}

export function upsertWorldPlayer(
  players: SharedWorldPlayer[],
  incoming: SharedWorldPlayer
): SharedWorldPlayer[] {
  const idx = players.findIndex((p) => p.playerId === incoming.playerId);
  if (idx === -1) return [...players, incoming];
  const next = [...players];
  next[idx] = incoming;
  return next;
}

export function removeWorldPlayer(
  players: SharedWorldPlayer[],
  playerId: string
): SharedWorldPlayer[] {
  return players.filter((p) => p.playerId !== playerId);
}

export function applyWorldDamage(
  players: SharedWorldPlayer[],
  targetPlayerId: string,
  currentHealth: number,
  maxHealth: number,
  isAlive: boolean
): SharedWorldPlayer[] {
  return players.map((p) =>
    p.playerId === targetPlayerId
      ? { ...p, currentHealth, maxHealth, isAlive }
      : p
  );
}
