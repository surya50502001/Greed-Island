import React from 'react';
import { RaidEvent } from '../../domain/raids/types';

interface RaidGatheringPanelProps {
  raid: RaidEvent;
  localPlayerId: string;
  nowSec: number;
  onJoin: (raidId: string) => void;
  onLeave: (raidId: string) => void;
  onBeginEncounter: (raidId: string) => void;
}

export const RaidGatheringPanel: React.FC<RaidGatheringPanelProps> = ({
  raid,
  localPlayerId,
  nowSec,
  onJoin,
  onLeave,
  onBeginEncounter,
}) => {
  const isJoined = raid.participants.some((p) => p.playerId === localPlayerId);
  const prepLeft = Math.max(0, Math.ceil(raid.startTime - nowSec));
  const canStart = isJoined && raid.participants.length >= raid.minParticipants;

  return (
    <div
      style={{
        position: 'fixed',
        left: '24px',
        bottom: '92px',
        zIndex: 24,
        width: '295px',
        padding: '14px',
        borderRadius: '14px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1.5px solid rgba(168, 85, 247, 0.7)',
        boxShadow: '0 14px 36px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#e9d5ff' }}>
          ⚔️ {raid.bossName} Raid Zone
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '999px',
            background: 'rgba(88, 28, 135, 0.75)',
            color: '#f3e8ff',
          }}
        >
          {raid.difficulty} · T{raid.tier}
        </span>
      </div>

      <div style={{ fontSize: '11px', color: '#cbd5e1', display: 'grid', gap: '3px' }}>
        <div>
          Prep Countdown: <strong style={{ color: '#fde047' }}>{prepLeft}s</strong>
        </div>
        <div>
          Participants:{' '}
          <strong>
            {raid.participants.length} / {raid.maxParticipants}
          </strong>{' '}
          (Min {raid.minParticipants} · Rec {raid.recommendedPartySize})
        </div>
      </div>

      {raid.participants.length > 0 && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'rgba(30, 41, 59, 0.7)',
            fontSize: '11px',
            color: '#e2e8f0',
          }}
        >
          {raid.participants.map((p) => (
            <div key={p.playerId}>
              • {p.displayName} {p.ready ? '✓' : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        {!isJoined ? (
          <button
            type="button"
            onClick={() => onJoin(raid.raidId)}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.7)',
              background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Join Raid
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onLeave(raid.raidId)}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'rgba(30, 41, 59, 0.85)',
                color: '#cbd5e1',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Leave
            </button>
            <button
              type="button"
              disabled={!canStart}
              onClick={() => onBeginEncounter(raid.raidId)}
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(250, 204, 21, 0.7)',
                background: canStart
                  ? 'linear-gradient(135deg, #9333ea, #db2777)'
                  : 'rgba(51, 65, 85, 0.6)',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: canStart ? 'pointer' : 'not-allowed',
              }}
            >
              Begin Encounter
            </button>
          </>
        )}
      </div>
    </div>
  );
};
