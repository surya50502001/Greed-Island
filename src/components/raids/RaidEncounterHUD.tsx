import React from 'react';
import { BossEncounterState, FENRIR_BOSS_CONFIG } from '../../domain/bosses/types';
import { RaidEvent } from '../../domain/raids/types';

interface RaidEncounterHUDProps {
  raid: RaidEvent | null;
  boss: BossEncounterState | null;
  nowSec: number;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export const RaidEncounterHUD: React.FC<RaidEncounterHUDProps> = ({ raid, boss, nowSec }) => {
  if (!raid || !boss || raid.status !== 'InProgress') return null;

  const hpPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
  const timeLeft = Math.max(0, raid.endTime - nowSec);
  const isDefeated = boss.hp <= 0;
  const activeAbility = boss.activeAbilityId
    ? FENRIR_BOSS_CONFIG.abilities.find((a) => a.id === boss.activeAbilityId)?.name
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 19,
        width: 'min(360px, 56vw)',
        minWidth: '210px',
        padding: '8px 12px',
        borderRadius: '10px',
        background: 'rgba(11, 14, 21, 0.9)',
        border: '1px solid rgba(212, 175, 55, 0.35)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '2px 5px',
              borderRadius: '4px',
              background: isDefeated ? 'rgba(22, 163, 74, 0.25)' : 'rgba(185, 28, 28, 0.32)',
              border: `1px solid ${isDefeated ? '#22c55e' : '#dc2626'}`,
              color: isDefeated ? '#bbf7d0' : '#fecaca',
              flexShrink: 0,
            }}
          >
            {isDefeated ? 'DEFEATED' : `ACTIVE · P${boss.phase}`}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: '#f3e8c8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {FENRIR_BOSS_CONFIG.displayName}, {FENRIR_BOSS_CONFIG.title}
          </span>
        </div>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: timeLeft < 30 ? '#fca5a5' : '#e2c275',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {formatTimer(timeLeft)}
        </span>
      </div>

      {/* Boss Health Bar with Phase Markers */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '8px',
          borderRadius: '4px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${hpPct}%`,
            height: '100%',
            background:
              boss.phase === 3
                ? '#dc2626'
                : boss.phase === 2
                  ? '#b91c1c'
                  : '#991b1b',
            transition: 'width 0.12s ease-out',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '33.3%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'rgba(15, 23, 42, 0.7)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '66.6%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'rgba(15, 23, 42, 0.7)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '10px',
          color: '#cbd5e1',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {boss.hp} / {boss.maxHp} HP
          {boss.shieldHp > 0 ? ` · Shield ${boss.shieldHp}` : ''}
        </span>
        {boss.aiState === 'Telegraph' && activeAbility ? (
          <span style={{ color: '#fca5a5', fontWeight: 800 }}>⚠ {activeAbility}</span>
        ) : boss.weakPointExposed ? (
          <span style={{ color: '#fde68a', fontWeight: 800 }}>WEAK POINT EXPOSED</span>
        ) : (
          <span style={{ color: '#94a3b8' }}>
            T{raid.tier} · {raid.participants.length} Hunter{raid.participants.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
};
