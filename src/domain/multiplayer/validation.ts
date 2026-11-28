const VALID_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;
const VALID_ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

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

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateRoomCode(raw: string): ValidationResult {
  const normalized = normalizeRoomCode(raw);
  if (!VALID_ROOM_CODE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Room code must be 6 letters/numbers.',
    };
  }
  return { valid: true, normalized };
}
