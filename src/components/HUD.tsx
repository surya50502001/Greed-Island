import React from 'react';
import { INVISIBILITY_DURATION } from '../types/game';

interface HUDProps {
  isFlying: boolean;
  hasWeapon: boolean;
  invisTimer: number;
  isGrimoireOpen: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  isFlying,
  hasWeapon,
  invisTimer,
  isGrimoireOpen,
}) => {
  const isInvisible = invisTimer > 0;
  const invisPct = Math.max(0, Math.min(100, (invisTimer / INVISIBILITY_DURATION) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px 24px',
        zIndex: 10,
      }}
    >
      {/* Top-center active ability status pills */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {isFlying && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(14, 116, 144, 0.78)',
              border: '1px solid rgba(56, 189, 248, 0.65)',
              color: '#e0f2fe',
              fontSize: '12px',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}
          >
            🕊️ Flight Active
          </div>
        )}

        {hasWeapon && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(8, 145, 178, 0.72)',
              border: '1px solid rgba(103, 232, 249, 0.65)',
              color: '#cffafe',
              fontSize: '12px',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}
          >
            ⚔️ Weapon Summoned
          </div>
        )}

        {isInvisible && (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(88, 28, 135, 0.78)',
              border: '1px solid rgba(192, 132, 252, 0.7)',
              color: '#f3e8ff',
              fontSize: '12px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              backdropFilter: 'blur(8px)',
            }}
          >
            👻 Invisible · {invisTimer.toFixed(1)}s
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2.5px',
                width: `${invisPct}%`,
                background: '#e9d5ff',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom-center airborne flight hints & Grimoire summon prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {isFlying && !isGrimoireOpen && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(10, 22, 40, 0.72)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#bae6fd',
              fontSize: '12px',
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
            }}
          >
            WASD Fly &nbsp;•&nbsp; Space Ascend &nbsp;•&nbsp; C Descend &nbsp;•&nbsp; Shift Boost
          </div>
        )}

        <div
          style={{
            padding: '7px 16px',
            borderRadius: '999px',
            background: 'rgba(15, 23, 42, 0.68)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            color: '#cbd5e1',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.03em',
            backdropFilter: 'blur(8px)',
          }}
        >
          {isGrimoireOpen
            ? 'Click a card to cast  •  Press G or Esc to close'
            : 'Press [G] to Summon Grimoire'}
        </div>
      </div>
    </div>
  );
};
