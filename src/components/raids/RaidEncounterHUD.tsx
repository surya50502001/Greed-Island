import React from 'react';
import { BossEncounterState, FENRIR_BOSS_CONFIG } from '../../domain/bosses/types';
import { RaidEvent } from '../../domain/raids/types';

interface RaidEncounterHUDProps {
  raid: RaidEvent | null;
  boss: BossEncounterState | null;
  nowSec: number;
}

export const RaidEncounterHUD: React.FC<RaidEncounterHUDProps> = ({ raid, boss, nowSec }) => {
  if (!raid || !boss || raid.status !== 'InProgress') return null;

  const hpPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
  const timeLeft = Math.max(0, Math.ceil(raid.endTime - nowSec));
  const activeAbility = boss.activeAbilityId
    ? FENRIR_BOSS_CONFIG.abilities.find((a) => a.id === boss.activeAbilityId)?.name
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 19,
        width: 'min(420px, 86vw)',
        padding: '10px 14px',
        borderRadius: '12px',
        background: 'rgba(15, 23, 42, 0.88)',
        border: '1.5px solid rgba(192, 132, 252, 0.65)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontWeight: 800,
          color: '#f3e8ff',
        }}
      >
        <span>
          🐺 {FENRIR_BOSS_CONFIG.displayName}, {FENRIR_BOSS_CONFIG.title} · Phase {boss.phase}
        </span>
        <span style={{ color: '#fde047', fontVariantNumeric: 'tabular-nums' }}>{timeLeft}s</span>
      </div>

      {/* Boss Health Bar */}
      <div
        style={{
          width: '100%',
          height: '10px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${hpPct}%`,
            height: '100%',
            background:
              boss.phase === 3
                ? 'linear-gradient(90deg, #dc2626, #f59e0b)'
                : boss.phase === 2
                  ? 'linear-gradient(90deg, #9333ea, #ec4899)'
                  : 'linear-gradient(90deg, #7c3aed, #38bdf8)',
            transition: 'width 0.12s ease-out',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#cbd5e1',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          HP: {boss.hp} / {boss.maxHp}
          {boss.shieldHp > 0 ? ` · Shield: ${boss.shieldHp}` : ''}
        </span>
        {boss.aiState === 'Telegraph' && activeAbility ? (
          <span style={{ color: '#fca5a5', fontWeight: 800 }}>⚠ {activeAbility}!</span>
        ) : boss.weakPointExposed ? (
          <span style={{ color: '#fde047', fontWeight: 800 }}>✦ WEAK POINT EXPOSED!</span>
        ) : (
          <span>Tier {raid.tier}</span>
        )}
      </div>
    </div>
  );
};
