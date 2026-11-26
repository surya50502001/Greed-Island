import React from 'react';
import { INVISIBILITY_DURATION, PLAYER_MAX_HP } from '../types/game';

interface HUDProps {
  hp: number;
  maxHp?: number;
  isDead: boolean;
  isFlying: boolean;
  hasWeapon: boolean;
  invisTimer: number;
  isGrimoireOpen: boolean;
  onRevive: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  hp,
  maxHp = PLAYER_MAX_HP,
  isDead,
  isFlying,
  hasWeapon,
  invisTimer,
  isGrimoireOpen,
  onRevive,
}) => {
  const isInvisible = invisTimer > 0;
  const invisPct = Math.max(0, Math.min(100, (invisTimer / INVISIBILITY_DURATION) * 100));
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const hpColor = hpPct > 55 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444';

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
        padding: '18px 24px 24px',
        zIndex: 10,
      }}
    >
      {/* Top bar: Player HP + Active Ability Pills */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        {/* Player Health Bar */}
        <div
          style={{
            width: '230px',
            padding: '7px 12px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.78)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 700,
              color: '#e2e8f0',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>HP</span>
            <span>
              {hp} / {maxHp}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '7px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${hpPct}%`,
                height: '100%',
                background: hpColor,
                transition: 'width 0.18s ease-out, background 0.2s ease',
              }}
            />
          </div>
        </div>

        {/* Active ability pills */}
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
      </div>

      {/* Death & Revival Overlay */}
      {isDead && (
        <div
          style={{
            pointerEvents: 'auto',
            padding: '24px 32px',
            borderRadius: '18px',
            background: 'rgba(10, 14, 26, 0.88)',
            border: '1.5px solid rgba(239, 68, 68, 0.6)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.04em' }}>
            YOU HAVE FALLEN
          </div>
          <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
            Return to the Starting Plaza to restore your health.
          </div>
          <button
            type="button"
            onClick={onRevive}
            style={{
              marginTop: '4px',
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.7)',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 18px rgba(56, 189, 248, 0.35)',
            }}
          >
            Revive at Starting Plaza [R]
          </button>
        </div>
      )}

      {/* Bottom-center airborne flight hints & Grimoire summon prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {isFlying && !isGrimoireOpen && !isDead && (
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

        {!isDead && (
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
        )}
      </div>
    </div>
  );
};
