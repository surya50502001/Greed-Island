import React, { useState } from 'react';
import { validateCharacterName } from '../../domain/multiplayer/validation';

interface MultiplayerLobbyProps {
  isOpen: boolean;
  statusMessage: string | null;
  isBusy: boolean;
  onEnterWorld: (characterName: string) => Promise<void>;
  onPlaySolo: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  isOpen,
  statusMessage,
  isBusy,
  onEnterWorld,
  onPlaySolo,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateCharacterName(nameInput);
    if (!res.valid) {
      setValidationError(res.error ?? 'Invalid character name.');
      return;
    }
    setValidationError(null);
    await onEnterWorld(res.normalized);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'radial-gradient(circle at top, rgba(15, 23, 42, 0.88), rgba(2, 6, 23, 0.96))',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(420px, 95vw)',
          padding: '24px',
          borderRadius: '18px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1.5px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 900,
              letterSpacing: '0.06em',
              color: '#7dd3fc',
            }}
          >
            GREED ISLAND
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Shared Open-World PvP · Enter your Hunter name to join
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>
            Character Name (3–16 characters)
          </label>
          <input
            type="text"
            value={nameInput}
            maxLength={16}
            placeholder="e.g. KAI or ITACHI"
            onChange={(e) => setNameInput(e.target.value)}
            style={{
              padding: '11px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(30, 41, 59, 0.85)',
              color: '#ffffff',
              fontSize: '15px',
              outline: 'none',
            }}
          />
          {(validationError || statusMessage) && (
            <div style={{ fontSize: '12px', color: '#fca5a5' }}>
              {validationError || statusMessage}
            </div>
          )}
          <button
            type="submit"
            disabled={isBusy}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.75)',
              background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              cursor: isBusy ? 'wait' : 'pointer',
            }}
          >
            {isBusy ? 'Entering World...' : 'Enter World'}
          </button>
        </form>

        <button
          type="button"
          onClick={onPlaySolo}
          style={{
            marginTop: '2px',
            padding: '9px 12px',
            borderRadius: '9px',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'transparent',
            color: '#cbd5e1',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Play Single Player (Offline)
        </button>
      </div>
    </div>
  );
};
