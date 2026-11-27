import React, { useEffect, useRef, useState } from 'react';
import { PlayerTouchBridge } from './Player';

interface MobileControlsProps {
  touchBridgeRef: React.MutableRefObject<PlayerTouchBridge | null>;
  isFlying: boolean;
  hasWeapon: boolean;
  isGrimoireOpen: boolean;
  onToggleGrimoire: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

const JOYSTICK_RADIUS = 52;

export const MobileControls: React.FC<MobileControlsProps> = ({
  touchBridgeRef,
  isFlying,
  hasWeapon,
  isGrimoireOpen,
  onToggleGrimoire,
  onVisibilityChange,
}) => {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      window.innerWidth <= 900
    );
  });

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const [sprintLocked, setSprintLocked] = useState(false);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const stickBaseRef = useRef<HTMLDivElement>(null);
  const stickPointerId = useRef<number | null>(null);

  // Release all touch inputs (including sprint) when hidden, Grimoire opens, or window loses focus
  useEffect(() => {
    const releaseAll = () => {
      setKnobOffset({ x: 0, y: 0 });
      stickPointerId.current = null;
      setSprintLocked(false);
      touchBridgeRef.current?.setMove(0, 0);
      touchBridgeRef.current?.setAction('sprint', false);
      touchBridgeRef.current?.setAction('jump', false);
      touchBridgeRef.current?.setAction('descend', false);
      touchBridgeRef.current?.setAction('block', false);
    };

    if (!visible || isGrimoireOpen) {
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
  }, [visible, isGrimoireOpen, touchBridgeRef]);

  // Release state-specific held buttons when gameplay state changes (e.g. flight or weapon toggled)
  useEffect(() => {
    if (!hasWeapon || isFlying) {
      touchBridgeRef.current?.setAction('block', false);
    }
    if (!isFlying) {
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

  const actionBtnStyle = (accent = 'rgba(255,255,255,0.22)', active = false): React.CSSProperties => ({
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: `1.5px solid ${active ? '#38bdf8' : accent}`,
    background: active ? 'rgba(14, 116, 144, 0.78)' : 'rgba(15, 23, 42, 0.68)',
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
    cursor: 'pointer',
  });

  return (
    <>
      {/* Top-right toggle so desktop or mobile users can show/hide touch panel anytime */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          position: 'fixed',
          top: '18px',
          right: '18px',
          zIndex: 25,
          padding: '6px 12px',
          borderRadius: '999px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(15, 23, 42, 0.72)',
          color: '#e2e8f0',
          fontSize: '12px',
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
        }}
      >
        {visible ? '🎮 Hide Touch' : '🎮 Touch Pad'}
      </button>

      {visible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {/* Left Virtual Joystick (hidden while Grimoire is open) */}
          {!isGrimoireOpen && (
            <div
              ref={stickBaseRef}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
              style={{
                position: 'absolute',
                left: '26px',
                bottom: '34px',
                width: `${JOYSTICK_RADIUS * 2 + 16}px`,
                height: `${JOYSTICK_RADIUS * 2 + 16}px`,
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1.5px solid rgba(255, 255, 255, 0.22)',
                backdropFilter: 'blur(6px)',
                pointerEvents: 'auto',
                touchAction: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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
              right: '24px',
              bottom: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '12px',
              pointerEvents: 'auto',
            }}
          >
            {/* Grimoire button (always accessible to open or close) */}
            <button
              type="button"
              onClick={onToggleGrimoire}
              style={actionBtnStyle('rgba(192, 132, 252, 0.7)', isGrimoireOpen)}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>📖</span>
              <span style={{ fontSize: '10px' }}>{isGrimoireOpen ? 'Close' : 'Book'}</span>
            </button>

            {!isGrimoireOpen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 56px)',
                  gap: '10px',
                }}
              >
                {/* Sprint toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !sprintLocked;
                    setSprintLocked(next);
                    touchBridgeRef.current?.setAction('sprint', next);
                  }}
                  style={actionBtnStyle('rgba(56, 189, 248, 0.5)', sprintLocked)}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⚡</span>
                  <span style={{ fontSize: '10px' }}>Sprint</span>
                </button>

                {/* Jump / Ascend */}
                <button
                  type="button"
                  onPointerDown={() => touchBridgeRef.current?.setAction('jump', true)}
                  onPointerUp={() => touchBridgeRef.current?.setAction('jump', false)}
                  onPointerCancel={() => touchBridgeRef.current?.setAction('jump', false)}
                  onPointerLeave={() => touchBridgeRef.current?.setAction('jump', false)}
                  style={actionBtnStyle('rgba(125, 211, 252, 0.6)')}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⬆️</span>
                  <span style={{ fontSize: '10px' }}>{isFlying ? 'Ascend' : 'Jump'}</span>
                </button>

                {/* Dodge or Flight Descend */}
                {isFlying ? (
                  <button
                    type="button"
                    onPointerDown={() => touchBridgeRef.current?.setAction('descend', true)}
                    onPointerUp={() => touchBridgeRef.current?.setAction('descend', false)}
                    onPointerCancel={() => touchBridgeRef.current?.setAction('descend', false)}
                    onPointerLeave={() => touchBridgeRef.current?.setAction('descend', false)}
                    style={actionBtnStyle('rgba(56, 189, 248, 0.6)')}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>⬇️</span>
                    <span style={{ fontSize: '10px' }}>Descend</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onPointerDown={() => touchBridgeRef.current?.triggerDodge()}
                    style={actionBtnStyle('rgba(255, 255, 255, 0.3)')}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>💨</span>
                    <span style={{ fontSize: '10px' }}>Dodge</span>
                  </button>
                )}

                {/* Attack (when weapon summoned) */}
                {hasWeapon && (
                  <button
                    type="button"
                    onPointerDown={() => touchBridgeRef.current?.triggerAttack()}
                    style={actionBtnStyle('rgba(34, 211, 238, 0.75)')}
                  >
                    <span style={{ fontSize: '17px', lineHeight: 1 }}>⚔️</span>
                    <span style={{ fontSize: '10px' }}>Attack</span>
                  </button>
                )}

                {/* Block (when weapon summoned & grounded) */}
                {hasWeapon && !isFlying && (
                  <button
                    type="button"
                    onPointerDown={() => touchBridgeRef.current?.setAction('block', true)}
                    onPointerUp={() => touchBridgeRef.current?.setAction('block', false)}
                    onPointerCancel={() => touchBridgeRef.current?.setAction('block', false)}
                    onPointerLeave={() => touchBridgeRef.current?.setAction('block', false)}
                    style={actionBtnStyle('rgba(251, 191, 36, 0.65)')}
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
