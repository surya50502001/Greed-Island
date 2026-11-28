import React, { useState } from 'react';
import {
  normalizeRoomCode,
  validateCharacterName,
  validateRoomCode,
} from '../../domain/multiplayer/validation';
import { RemotePlayerSnapshot } from '../../network/SignalRClient';

interface MultiplayerLobbyProps {
  isOpen: boolean;
  roomCode: string | null;
  players: RemotePlayerSnapshot[];
  localPlayerId: string | null;
  statusMessage: string | null;
  isBusy: boolean;
  onCreateRoom: (characterName: string) => Promise<void>;
  onJoinRoom: (characterName: string, roomCode: string) => Promise<void>;
  onPlaySolo: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  isOpen,
  roomCode,
  players,
  localPlayerId,
  statusMessage,
  isBusy,
  onCreateRoom,
  onJoinRoom,
  onPlaySolo,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleConfirmName = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateCharacterName(nameInput);
    if (!res.valid) {
      setValidationError(res.error ?? 'Invalid character name.');
      return;
    }
    setValidationError(null);
    setConfirmedName(res.normalized);
  };

  const handleCreate = async () => {
    if (!confirmedName) return;
    setValidationError(null);
    await onCreateRoom(confirmedName);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedName) return;
    const codeRes = validateRoomCode(roomCodeInput);
    if (!codeRes.valid) {
      setValidationError(codeRes.error ?? 'Invalid room code.');
      return;
    }
    setValidationError(null);
    await onJoinRoom(confirmedName, codeRes.normalized);
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
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
          width: 'min(440px, 95vw)',
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
            {!confirmedName
              ? 'Step 1: Create Your Hunter Identity'
              : roomCode
                ? 'Waiting for Partner to Join Starting Plaza'
                : `Welcome, ${confirmedName} — Choose Multiplayer Mode`}
          </div>
        </div>

        {/* Step 1: Character Name Creation */}
        {!confirmedName && (
          <form
            onSubmit={handleConfirmName}
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
            {validationError && (
              <div style={{ fontSize: '12px', color: '#fca5a5' }}>{validationError}</div>
            )}
            <button
              type="submit"
              style={{
                padding: '11px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(56, 189, 248, 0.75)',
                background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Confirm Name
            </button>
          </form>
        )}

        {/* Step 2: Create or Join Room */}
        {confirmedName && !roomCode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleCreate}
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(192, 132, 252, 0.7)',
                background: 'linear-gradient(135deg, #7e22ce, #4f46e5)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 800,
                cursor: isBusy ? 'wait' : 'pointer',
              }}
            >
              {isBusy ? 'Connecting...' : 'Create Room (2 Players)'}
            </button>

            <div
              style={{
                textAlign: 'center',
                fontSize: '11px',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              or join a friend
            </div>

            <form onSubmit={handleJoin} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={roomCodeInput}
                maxLength={6}
                placeholder="ROOM CODE"
                onChange={(e) => setRoomCodeInput(normalizeRoomCode(e.target.value))}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(30, 41, 59, 0.85)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={isBusy}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(56, 189, 248, 0.7)',
                  background: 'rgba(14, 116, 144, 0.85)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: isBusy ? 'wait' : 'pointer',
                }}
              >
                Join
              </button>
            </form>

            {(validationError || statusMessage) && (
              <div style={{ fontSize: '12px', color: '#fca5a5', textAlign: 'center' }}>
                {validationError || statusMessage}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Waiting Room with Room Code & Connected Players */}
        {confirmedName && roomCode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(192, 132, 252, 0.45)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Room Code
                </div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 900,
                    letterSpacing: '0.18em',
                    color: '#fde047',
                  }}
                >
                  {roomCode}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(250, 204, 21, 0.6)',
                  background: 'rgba(113, 63, 18, 0.55)',
                  color: '#fef08a',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                Connected Players ({players.length} / 2)
              </div>
              {players.map((p) => (
                <div key={p.playerId} style={{ color: '#e2e8f0', fontWeight: 700 }}>
                  ● {p.characterName} {p.playerId === localPlayerId ? '(You)' : ''}
                </div>
              ))}
              {players.length < 2 && (
                <div style={{ fontSize: '12px', color: '#7dd3fc' }}>
                  Share the room code with a friend to enter Greed Island together...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Single-Player Mode Fallback */}
        <button
          type="button"
          onClick={onPlaySolo}
          style={{
            marginTop: '4px',
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
