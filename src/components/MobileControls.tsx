import React, { useEffect, useRef, useState } from 'react';
import { isTouchControlPreferred } from '../domain/input/controls';
import { PlayerTouchBridge } from './Player';

interface MobileControlsProps {
  touchBridgeRef: React.MutableRefObject<PlayerTouchBridge | null>;
  isFlying: boolean;
  hasWeapon: boolean;
  isGrimoireOpen: boolean;
  isMapOpen?: boolean;
  onToggleGrimoire: () => void;
  onToggleMap: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

const JOYSTICK_RADIUS = 52;

type HoldAction = 'jump' | 'descend' | 'block';

export const MobileControls: React.FC<MobileControlsProps> = ({
  touchBridgeRef,
  isFlying,
  hasWeapon,
  isGrimoireOpen,
  isMapOpen = false,
  onToggleGrimoire,
  onToggleMap,
  onVisibilityChange,
}) => {
  const [visible, setVisible] = useState<boolean>(() => isTouchControlPreferred());
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const manualOverrideRef = useRef(false);

  // React to device capability / viewport orientation changes unless user manually toggled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarseMql = window.matchMedia?.('(pointer: coarse)');
    const handleEnvChange = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      if (!manualOverrideRef.current) {
        setVisible(isTouchControlPreferred());
      }
    };
    coarseMql?.addEventListener?.('change', handleEnvChange);
    window.addEventListener('resize', handleEnvChange);
    window.addEventListener('orientationchange', handleEnvChange);
    return () => {
      coarseMql?.removeEventListener?.('change', handleEnvChange);
      window.removeEventListener('resize', handleEnvChange);
      window.removeEventListener('orientationchange', handleEnvChange);
    };
  }, []);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const [sprintLocked, setSprintLocked] = useState(false);
  const [heldActions, setHeldActions] = useState<Record<HoldAction, boolean>>({
    jump: false,
    descend: false,
    block: false,
  });
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const stickBaseRef = useRef<HTMLDivElement>(null);
  const stickPointerId = useRef<number | null>(null);
  const actionPointerIds = useRef<Record<HoldAction, number | null>>({
    jump: null,
    descend: null,
    block: null,
  });

  const overlayBlocking = isGrimoireOpen || isMapOpen;

  // Release all touch inputs when hidden, overlay opens, or window loses focus
  useEffect(() => {
    const releaseAll = () => {
      setKnobOffset({ x: 0, y: 0 });
      stickPointerId.current = null;
      actionPointerIds.current = { jump: null, descend: null, block: null };
      setHeldActions({ jump: false, descend: false, block: false });
      setSprintLocked(false);
      touchBridgeRef.current?.setMove(0, 0);
      touchBridgeRef.current?.setAction('sprint', false);
      touchBridgeRef.current?.setAction('jump', false);
      touchBridgeRef.current?.setAction('descend', false);
      touchBridgeRef.current?.setAction('block', false);
    };

    if (!visible || overlayBlocking) {
      releaseAll();
    }

    const handleBlur = () => releaseAll();
    const handleVisibility = () => {
      if (document.hidden) releaseAll();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [visible, overlayBlocking, touchBridgeRef]);

  // Release state-specific held buttons when gameplay state changes (e.g. flight or weapon toggled)
  useEffect(() => {
    if (!hasWeapon || isFlying) {
      actionPointerIds.current.block = null;
      setHeldActions((prev) => (prev.block ? { ...prev, block: false } : prev));
      touchBridgeRef.current?.setAction('block', false);
    }
    if (!isFlying) {
      actionPointerIds.current.descend = null;
      setHeldActions((prev) => (prev.descend ? { ...prev, descend: false } : prev));
      touchBridgeRef.current?.setAction('descend', false);
    }
  }, [hasWeapon, isFlying, touchBridgeRef]);

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = stickBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setKnobOffset({ x: dx, y: dy });
    // Screen Y down is negative forward movement
    touchBridgeRef.current?.setMove(dx / JOYSTICK_RADIUS, -dy / JOYSTICK_RADIUS);
  };

  const resetJoystick = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e) {
      const target = e.currentTarget;
      if (target.hasPointerCapture?.(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
    }
    stickPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    touchBridgeRef.current?.setMove(0, 0);
  };

  const bindHoldHandlers = (action: HoldAction) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable in synthetic test environments
      }
      actionPointerIds.current[action] = e.pointerId;
      setHeldActions((prev) => ({ ...prev, [action]: true }));
      touchBridgeRef.current?.setAction(action, true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointerIds.current[action] !== e.pointerId) return;
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      actionPointerIds.current[action] = null;
      setHeldActions((prev) => ({ ...prev, [action]: false }));
      touchBridgeRef.current?.setAction(action, false);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointerIds.current[action] !== e.pointerId) return;
      actionPointerIds.current[action] = null;
      setHeldActions((prev) => ({ ...prev, [action]: false }));
      touchBridgeRef.current?.setAction(action, false);
    },
    onLostPointerCapture: () => {
      if (actionPointerIds.current[action] === null) return;
      actionPointerIds.current[action] = null;
      setHeldActions((prev) => ({ ...prev, [action]: false }));
      touchBridgeRef.current?.setAction(action, false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const btnSize = isPortrait ? 52 : 56;

  const actionBtnStyle = (
    accent = 'rgba(255,255,255,0.22)',
    active = false
  ): React.CSSProperties => ({
    width: `${btnSize}px`,
    height: `${btnSize}px`,
    minWidth: '48px',
    minHeight: '48px',
    borderRadius: '50%',
    border: `1.5px solid ${active ? '#38bdf8' : accent}`,
    background: active ? 'rgba(14, 116, 144, 0.82)' : 'rgba(15, 23, 42, 0.68)',
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    touchAction: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: 'pointer',
  });

  const bottomOffset = isPortrait
    ? 'calc(84px + env(safe-area-inset-bottom, 0px))'
    : 'calc(22px + env(safe-area-inset-bottom, 0px))';

  return (
    <>
      {/* Top-right toggle so desktop or mobile users can show/hide touch panel anytime */}
      <button
        type="button"
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          manualOverrideRef.current = true;
          setVisible((v) => !v);
        }}
        style={{
          position: 'fixed',
          top: 'calc(14px + env(safe-area-inset-top, 0px))',
          right: 'calc(14px + env(safe-area-inset-right, 0px))',
          zIndex: 25,
          padding: '6px 12px',
          minHeight: '34px',
          borderRadius: '999px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(15, 23, 42, 0.72)',
          color: '#e2e8f0',
          fontSize: '12px',
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
          touchAction: 'manipulation',
          cursor: 'pointer',
        }}
      >
        {visible ? '🎮 Hide Touch' : '🎮 Touch Pad'}
      </button>

      {visible && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {/* Left Virtual Joystick (hidden while Grimoire/Map is open) */}
          {!overlayBlocking && (
            <div
              ref={stickBaseRef}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch {
                  // Ignore
                }
                stickPointerId.current = e.pointerId;
                updateJoystick(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (stickPointerId.current !== e.pointerId) return;
                updateJoystick(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (stickPointerId.current === e.pointerId) resetJoystick(e);
              }}
              onPointerCancel={(e) => {
                if (stickPointerId.current === e.pointerId) resetJoystick(e);
              }}
              onLostPointerCapture={() => {
                if (stickPointerId.current !== null) resetJoystick();
              }}
              style={{
                position: 'absolute',
                left: 'calc(18px + env(safe-area-inset-left, 0px))',
                bottom: bottomOffset,
                width: `${JOYSTICK_RADIUS * 2 + 16}px`,
                height: `${JOYSTICK_RADIUS * 2 + 16}px`,
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.52)',
                border: '1.5px solid rgba(255, 255, 255, 0.28)',
                boxShadow: 'inset 0 0 18px rgba(0,0,0,0.45)',
                backdropFilter: 'blur(6px)',
                pointerEvents: 'auto',
                touchAction: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ position: 'absolute', top: '6px', fontSize: '10px', color: 'rgba(226,232,240,0.65)', pointerEvents: 'none' }}>⌃</span>
              <span style={{ position: 'absolute', bottom: '6px', fontSize: '10px', color: 'rgba(226,232,240,0.65)', pointerEvents: 'none' }}>⌄</span>
              <span style={{ position: 'absolute', left: '8px', fontSize: '10px', color: 'rgba(226,232,240,0.65)', pointerEvents: 'none' }}>‹</span>
              <span style={{ position: 'absolute', right: '8px', fontSize: '10px', color: 'rgba(226,232,240,0.65)', pointerEvents: 'none' }}>›</span>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(125, 211, 252, 0.8)',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 14px rgba(56, 189, 248, 0.55)',
                  transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
                  transition: stickPointerId.current === null ? 'transform 0.12s ease-out' : 'none',
                }}
              />
            </div>
          )}

          {/* Right Action Cluster */}
          <div
            style={{
              position: 'absolute',
              right: 'calc(18px + env(safe-area-inset-right, 0px))',
              bottom: bottomOffset,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '10px',
              pointerEvents: 'auto',
            }}
          >
            {/* Grimoire [G] & Island Map [M] buttons (always accessible) */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                aria-label="Toggle Island Map"
                onContextMenu={(e) => e.preventDefault()}
                onClick={onToggleMap}
                style={actionBtnStyle('rgba(56, 189, 248, 0.65)', isMapOpen)}
              >
                <span style={{ fontSize: '17px', lineHeight: 1 }}>🗺️</span>
                <span style={{ fontSize: '10px' }}>{isMapOpen ? 'Close' : 'Map'}</span>
              </button>

              <button
                type="button"
                aria-label="Toggle Grimoire"
                onContextMenu={(e) => e.preventDefault()}
                onClick={onToggleGrimoire}
                style={actionBtnStyle('rgba(192, 132, 252, 0.7)', isGrimoireOpen)}
              >
                <span style={{ fontSize: '17px', lineHeight: 1 }}>📖</span>
                <span style={{ fontSize: '10px' }}>{isGrimoireOpen ? 'Close' : 'Book'}</span>
              </button>
            </div>

            {!overlayBlocking && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(2, ${btnSize}px)`,
                  gap: '10px',
                }}
              >
                {/* Sprint toggle [Shift] */}
                <button
                  type="button"
                  aria-label="Toggle Sprint"
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    const next = !sprintLocked;
                    setSprintLocked(next);
                    touchBridgeRef.current?.setAction('sprint', next);
                  }}
                  style={actionBtnStyle('rgba(56, 189, 248, 0.5)', sprintLocked)}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⚡</span>
                  <span style={{ fontSize: '10px' }}>{isFlying ? 'Boost' : 'Sprint'}</span>
                </button>

                {/* Jump / Ascend [Space] */}
                <button
                  type="button"
                  aria-label={isFlying ? 'Ascend' : 'Jump'}
                  {...bindHoldHandlers('jump')}
                  style={actionBtnStyle('rgba(125, 211, 252, 0.6)', heldActions.jump)}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⬆️</span>
                  <span style={{ fontSize: '10px' }}>{isFlying ? 'Ascend' : 'Jump'}</span>
                </button>

                {/* Dodge [Q] or Flight Descend [C] */}
                {isFlying ? (
                  <button
                    type="button"
                    aria-label="Descend"
                    {...bindHoldHandlers('descend')}
                    style={actionBtnStyle('rgba(56, 189, 248, 0.6)', heldActions.descend)}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>⬇️</span>
                    <span style={{ fontSize: '10px' }}>Descend</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Dodge"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      touchBridgeRef.current?.triggerDodge();
                    }}
                    style={actionBtnStyle('rgba(255, 255, 255, 0.3)')}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>💨</span>
                    <span style={{ fontSize: '10px' }}>Dodge</span>
                  </button>
                )}

                {/* Attack [Left Click] (when weapon summoned) */}
                {hasWeapon && (
                  <button
                    type="button"
                    aria-label="Attack"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      touchBridgeRef.current?.triggerAttack();
                    }}
                    style={actionBtnStyle('rgba(34, 211, 238, 0.75)')}
                  >
                    <span style={{ fontSize: '17px', lineHeight: 1 }}>⚔️</span>
                    <span style={{ fontSize: '10px' }}>Attack</span>
                  </button>
                )}

                {/* Block [F] (when weapon summoned & grounded) */}
                {hasWeapon && !isFlying && (
                  <button
                    type="button"
                    aria-label="Block"
                    {...bindHoldHandlers('block')}
                    style={actionBtnStyle('rgba(251, 191, 36, 0.65)', heldActions.block)}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>🛡️</span>
                    <span style={{ fontSize: '10px' }}>Block</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
