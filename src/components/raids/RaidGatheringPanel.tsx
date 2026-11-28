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
  const statusLabel =
    raid.status === 'Gathering'
      ? 'GATHERING'
      : raid.status === 'Upcoming'
        ? 'UPCOMING'
        : raid.status.toUpperCase();

  return (
    <div
      style={{
        position: 'fixed',
        left: 'calc(14px + env(safe-area-inset-left, 0px))',
        bottom: 'calc(162px + env(safe-area-inset-bottom, 0px))',
        zIndex: 24,
        width: 'min(284px, 84vw)',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(11, 14, 21, 0.92)',
        border: '1px solid rgba(212, 175, 55, 0.36)',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.58)',
        backdropFilter: 'blur(8px)',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#f3e8c8' }}>
            {raid.bossName} Raid Zone
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
            {raid.difficulty} · Tier {raid.tier}
          </div>
        </div>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            padding: '2px 7px',
            borderRadius: '4px',
            background: 'rgba(146, 64, 14, 0.32)',
            border: '1px solid rgba(217, 119, 6, 0.55)',
            color: '#fde68a',
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div
        style={{
          fontSize: '11px',
          color: '#cbd5e1',
          display: 'grid',
          gap: '3px',
          borderTop: '1px solid rgba(148, 163, 184, 0.14)',
          paddingTop: '6px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Starts In</span>
          <strong style={{ color: '#fde68a', fontVariantNumeric: 'tabular-nums' }}>{prepLeft}s</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Hunters</span>
          <strong>
            {raid.participants.length} / {raid.maxParticipants} (Rec {raid.recommendedPartySize})
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Reward</span>
          <span style={{ color: '#e2e8f0' }}>Boss Card Drop</span>
        </div>
      </div>

      {raid.participants.length > 0 && (
        <div
          style={{
            padding: '5px 8px',
            borderRadius: '6px',
            background: 'rgba(20, 26, 38, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
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
              minHeight: '38px',
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid rgba(212, 175, 55, 0.55)',
              background: 'rgba(146, 64, 14, 0.65)',
              color: '#fef3c7',
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
                minHeight: '38px',
                padding: '7px 10px',
                borderRadius: '7px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
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
                minHeight: '38px',
                padding: '7px 10px',
                borderRadius: '7px',
                border: '1px solid rgba(220, 38, 38, 0.6)',
                background: canStart ? 'rgba(153, 27, 27, 0.82)' : 'rgba(51, 65, 85, 0.6)',
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
