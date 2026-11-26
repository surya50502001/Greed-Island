import React from 'react';
import { INVISIBILITY_DURATION } from '../types/game';

interface HUDProps {
  isFlying: boolean;
  hasWeapon: boolean;
  invisTimer: number;
  onToggleFlight: () => void;
  onToggleWeapon: () => void;
  onTriggerInvis: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  isFlying,
  hasWeapon,
  invisTimer,
  onToggleFlight,
  onToggleWeapon,
  onTriggerInvis,
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
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '26px',
        zIndex: 10,
      }}
    >
      {/* Brief flight key hints when airborne */}
      {isFlying && (
        <div
          style={{
            marginBottom: '12px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(10, 22, 40, 0.72)',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            color: '#bae6fd',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.03em',
            backdropFilter: 'blur(8px)',
          }}
        >
          WASD Fly &nbsp;•&nbsp; Space Ascend &nbsp;•&nbsp; C Descend &nbsp;•&nbsp; Shift Boost
        </div>
      )}

      {/* 3-Card Hotbar */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          pointerEvents: 'auto',
        }}
      >
        {/* [1] Flight Card */}
        <button
          type="button"
          onClick={onToggleFlight}
          style={{
            position: 'relative',
            width: '126px',
            height: '84px',
            borderRadius: '14px',
            border: isFlying
              ? '2px solid #38bdf8'
              : '1px solid rgba(255, 255, 255, 0.18)',
            background: isFlying
              ? 'linear-gradient(160deg, rgba(14, 116, 144, 0.85), rgba(15, 23, 42, 0.9))'
              : 'rgba(15, 23, 42, 0.72)',
            boxShadow: isFlying
              ? '0 0 22px rgba(56, 189, 248, 0.45)'
              : '0 8px 24px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(10px)',
            color: '#f8fafc',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            transition: 'all 0.16s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '7px',
              left: '9px',
              fontSize: '11px',
              fontWeight: 700,
              color: isFlying ? '#7dd3fc' : '#94a3b8',
            }}
          >
            [1]
          </span>
          <span style={{ fontSize: '20px', lineHeight: 1 }}>🕊️</span>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Flight</span>
          {isFlying && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#38bdf8',
                letterSpacing: '0.06em',
              }}
            >
              AIRBORNE
            </span>
          )}
        </button>

        {/* [2] Weapon Card */}
        <button
          type="button"
          onClick={onToggleWeapon}
          style={{
            position: 'relative',
            width: '126px',
            height: '84px',
            borderRadius: '14px',
            border: hasWeapon
              ? '2px solid #22d3ee'
              : '1px solid rgba(255, 255, 255, 0.18)',
            background: hasWeapon
              ? 'linear-gradient(160deg, rgba(8, 145, 178, 0.8), rgba(15, 23, 42, 0.9))'
              : 'rgba(15, 23, 42, 0.72)',
            boxShadow: hasWeapon
              ? '0 0 22px rgba(34, 211, 238, 0.42)'
              : '0 8px 24px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(10px)',
            color: '#f8fafc',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            transition: 'all 0.16s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '7px',
              left: '9px',
              fontSize: '11px',
              fontWeight: 700,
              color: hasWeapon ? '#67e8f9' : '#94a3b8',
            }}
          >
            [2]
          </span>
          <span style={{ fontSize: '20px', lineHeight: 1 }}>⚔️</span>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Weapon</span>
          {hasWeapon && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#67e8f9',
                letterSpacing: '0.06em',
              }}
            >
              SUMMONED
            </span>
          )}
        </button>

        {/* [3] Invisibility Card */}
        <button
          type="button"
          onClick={onTriggerInvis}
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: '126px',
            height: '84px',
            borderRadius: '14px',
            border: isInvisible
              ? '2px solid #c084fc'
              : '1px solid rgba(255, 255, 255, 0.18)',
            background: isInvisible
              ? 'linear-gradient(160deg, rgba(107, 33, 168, 0.8), rgba(15, 23, 42, 0.92))'
              : 'rgba(15, 23, 42, 0.72)',
            boxShadow: isInvisible
              ? '0 0 22px rgba(192, 132, 252, 0.45)'
              : '0 8px 24px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(10px)',
            color: '#f8fafc',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            transition: 'all 0.16s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '7px',
              left: '9px',
              fontSize: '11px',
              fontWeight: 700,
              color: isInvisible ? '#e9d5ff' : '#94a3b8',
            }}
          >
            [3]
          </span>
          <span style={{ fontSize: '20px', lineHeight: 1 }}>👻</span>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Invisibility</span>
          {isInvisible && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#e9d5ff',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {invisTimer.toFixed(1)}s
            </span>
          )}
          {isInvisible && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                width: `${invisPct}%`,
                background: '#d8b4fe',
                transition: 'width 0.1s linear',
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
};
