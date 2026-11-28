import React from 'react';
import { CARD_DEFINITIONS, INVISIBILITY_DURATION, PLAYER_MAX_HP } from '../types/game';
import {
  ActiveCardLoadout,
  AnyCardId,
  CardCooldownMap,
  CardInventory,
} from '../domain/cards/types';
import { FloatingDamageEvent } from './Player';

export interface ActiveDamageNumber extends FloatingDamageEvent {
  id: number;
}

interface HUDProps {
  hp: number;
  maxHp?: number;
  isDead: boolean;
  isFlying: boolean;
  hasWeapon: boolean;
  invisTimer: number;
  isGrimoireOpen: boolean;
  hideKeyboardHints?: boolean;
  damageNumbers?: ActiveDamageNumber[];
  comboCount?: number;
  comboStep?: number;
  comboAttackName?: string;
  comboTimer?: number;
  inventory?: CardInventory;
  loadout?: ActiveCardLoadout;
  cooldowns?: CardCooldownMap;
  onActivateSlotCard?: (cardId: AnyCardId) => void;
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
  hideKeyboardHints = false,
  damageNumbers = [],
  comboCount = 0,
  comboStep = 0,
  comboAttackName = '',
  comboTimer = 0,
  inventory,
  loadout,
  cooldowns = {},
  onActivateSlotCard,
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
      {/* Top bar: Player HP (left, away from top-right touch toggle) + Active Ability Pills */}
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
            alignSelf: 'flex-start',
            width: '176px',
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

      {/* Anime Combo Counter & Sword Art Callout */}
      {comboCount > 0 && !isDead && (
        <div
          key={comboCount}
          className="combo-callout"
          style={{
            position: 'fixed',
            right: '28px',
            top: '36%',
            pointerEvents: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(30, 41, 59, 0.78))',
            borderLeft: `4px solid ${
              comboStep === 4
                ? '#f97316'
                : comboStep === 3
                  ? '#fde047'
                  : comboStep === 2
                    ? '#c084fc'
                    : '#38bdf8'
            }`,
            boxShadow: `0 8px 28px rgba(0, 0, 0, 0.45), 0 0 18px ${
              comboStep === 4 ? 'rgba(249, 115, 22, 0.35)' : 'rgba(56, 189, 248, 0.2)'
            }`,
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '4px',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '30px',
                fontWeight: 900,
                fontStyle: 'italic',
                lineHeight: 1,
                color:
                  comboStep === 4
                    ? '#fde047'
                    : comboStep === 3
                      ? '#fef08a'
                      : comboStep === 2
                        ? '#e9d5ff'
                        : '#7dd3fc',
                textShadow: '0 2px 10px rgba(0,0,0,0.8)',
              }}
            >
              {comboCount}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.14em',
                color: '#cbd5e1',
              }}
            >
              HIT{comboCount > 1 ? 'S' : ''}
            </span>
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#f8fafc',
            }}
          >
            {comboAttackName}
          </div>
          <div
            style={{
              width: '120px',
              height: '3px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.14)',
              overflow: 'hidden',
              marginTop: '2px',
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (comboTimer / 2.6) * 100))}%`,
                height: '100%',
                background:
                  comboStep === 4
                    ? 'linear-gradient(90deg, #f97316, #fde047)'
                    : 'linear-gradient(90deg, #38bdf8, #c084fc)',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>
      )}

      {/* Floating Anime Damage Numbers */}
      {damageNumbers.map((dn) => (
        <div
          key={dn.id}
          className="floating-dmg"
          style={{
            position: 'fixed',
            left: `${dn.x}%`,
            top: `${dn.y}%`,
            pointerEvents: 'none',
            fontWeight: 900,
            fontStyle: 'italic',
            fontSize: dn.isFinisher ? '28px' : dn.comboStep === 3 ? '22px' : '19px',
            color: dn.isFinisher
              ? '#fef08a'
              : dn.comboStep === 3
                ? '#facc15'
                : dn.comboStep === 2
                  ? '#e9d5ff'
                  : '#a5f3fc',
            WebkitTextStroke: dn.isFinisher ? '1px rgba(154, 52, 18, 0.95)' : '0.8px rgba(15, 23, 42, 0.9)',
            textShadow: dn.isFinisher
              ? '0 0 16px rgba(249, 115, 22, 0.95), 0 3px 6px rgba(0,0,0,0.95)'
              : '0 0 10px rgba(56, 189, 248, 0.55), 0 2px 5px rgba(0, 0, 0, 0.95)',
            letterSpacing: '0.03em',
            zIndex: 25,
          }}
        >
          {dn.isFinisher ? `${dn.amount} BREAKER!` : dn.amount}
        </div>
      ))}

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

      {/* Bottom-center airborne flight hints & Grimoire summon prompt (hidden when mobile touch pad is visible) */}
      {!hideKeyboardHints && (
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

          {!isDead && loadout && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                pointerEvents: 'auto',
              }}
            >
              {loadout.slots.map((cardId, idx) => {
                const def = cardId
                  ? CARD_DEFINITIONS.find((c) => c.id === cardId)
                  : undefined;
                const entry = cardId && inventory ? inventory.cards[cardId] : undefined;
                const cd = cardId ? cooldowns[cardId] ?? 0 : 0;
                const isCardActive =
                  (cardId === 'flight' && isFlying) ||
                  (cardId === 'weapon' && hasWeapon) ||
                  (cardId === 'invisibility' && isInvisible);
                const label = def
                  ? def.name
                  : cardId
                    ? cardId.replace(/_/g, ' ')
                    : 'Empty';

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!cardId || cd > 0}
                    onClick={() => cardId && cd <= 0 && onActivateSlotCard?.(cardId)}
                    style={{
                      minWidth: '82px',
                      padding: '6px 10px',
                      borderRadius: '10px',
                      border: `1.5px solid ${
                        isCardActive
                          ? '#4ade80'
                          : cardId
                            ? 'rgba(148, 163, 184, 0.45)'
                            : 'rgba(148, 163, 184, 0.2)'
                      }`,
                      background: isCardActive
                        ? 'rgba(20, 83, 45, 0.78)'
                        : 'rgba(15, 23, 42, 0.78)',
                      color: cardId ? '#f8fafc' : '#64748b',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: cardId && cd <= 0 ? 'pointer' : 'default',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      opacity: cd > 0 ? 0.65 : 1,
                    }}
                  >
                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                      [{idx + 1}] {entry ? `Lv.${entry.level}` : ''}
                    </span>
                    <span style={{ textTransform: 'capitalize' }}>{label}</span>
                    {cd > 0 && (
                      <span style={{ fontSize: '10px', color: '#fde047' }}>
                        {Math.ceil(cd)}s
                      </span>
                    )}
                  </button>
                );
              })}
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
                : 'Press [G] Grimoire  •  [M] Island Map'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
