import React from 'react';
import {
  computeCardinalDirection,
  computeDistanceMeters,
} from '../../domain/world/mapProjection';
import { RaidEvent } from '../../domain/raids/types';
import { Vec3 } from '../../domain/math/vec3';

interface RaidNotificationsProps {
  raids: RaidEvent[];
  playerPos: Vec3;
  nowSec: number;
  dismissedIds: Set<string>;
  trackedRaidId: string | null;
  onDismiss: (raidId: string) => void;
  onReopenAll: () => void;
  onViewOnMap: (raidId: string) => void;
  onClearTrack: () => void;
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function statusBadge(status: RaidEvent['status']): { label: string; border: string; text: string } {
  switch (status) {
    case 'InProgress':
      return { label: 'ACTIVE', border: 'rgba(220, 38, 38, 0.65)', text: '#fecaca' };
    case 'Gathering':
      return { label: 'GATHERING', border: 'rgba(217, 119, 6, 0.65)', text: '#fde68a' };
    default:
      return { label: 'UPCOMING', border: 'rgba(148, 163, 184, 0.4)', text: '#e2e8f0' };
  }
}

export const RaidNotifications: React.FC<RaidNotificationsProps> = ({
  raids,
  playerPos,
  nowSec,
  dismissedIds,
  trackedRaidId,
  onDismiss,
  onReopenAll,
  onViewOnMap,
  onClearTrack,
}) => {
  const activeRaids = raids.filter(
    (r) =>
      r.status === 'Upcoming' ||
      r.status === 'Gathering' ||
      r.status === 'InProgress'
  );

  const visibleNotifs = activeRaids.filter((r) => !dismissedIds.has(r.raidId)).slice(0, 2);
  const trackedRaid = activeRaids.find((r) => r.raidId === trackedRaidId) ?? null;

  return (
    <>
      {activeRaids.length > 0 && visibleNotifs.length === 0 && (
        <button
          type="button"
          onClick={onReopenAll}
          style={{
            position: 'fixed',
            top: 'calc(54px + env(safe-area-inset-top, 0px))',
            right: 'calc(14px + env(safe-area-inset-right, 0px))',
            zIndex: 22,
            padding: '5px 11px',
            borderRadius: '8px',
            border: '1px solid rgba(212, 175, 55, 0.45)',
            background: 'rgba(11, 14, 21, 0.88)',
            color: '#f3e8c8',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          {activeRaids.length} Active Raid{activeRaids.length > 1 ? 's' : ''}
        </button>
      )}

      {/* Active Raid Event Cards */}
      <div
        style={{
          position: 'fixed',
          top: 'calc(54px + env(safe-area-inset-top, 0px))',
          right: 'calc(14px + env(safe-area-inset-right, 0px))',
          zIndex: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: 'min(256px, 68vw)',
          pointerEvents: 'none',
        }}
      >
        {visibleNotifs.map((raid) => {
          const dist = computeDistanceMeters(
            playerPos.x,
            playerPos.z,
            raid.location.x,
            raid.location.z
          );
          const dir = computeCardinalDirection(
            playerPos.x,
            playerPos.z,
            raid.location.x,
            raid.location.z
          );
          const timeLeft =
            raid.status === 'InProgress'
              ? raid.endTime - nowSec
              : raid.startTime - nowSec;
          const badge = statusBadge(raid.status);

          return (
            <div
              key={raid.raidId}
              style={{
                pointerEvents: 'auto',
                padding: '9px 11px',
                borderRadius: '10px',
                background: 'rgba(11, 14, 21, 0.9)',
                border: `1px solid ${badge.border}`,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                color: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        border: `1px solid ${badge.border}`,
                        color: badge.text,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#f3e8c8' }}>
                      {raid.bossName}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    {raid.difficulty} T{raid.tier} · {raid.locationLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(raid.raidId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: '0 3px',
                  }}
                  aria-label="Dismiss raid notification"
                >
                  ✕
                </button>
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
                  {raid.status === 'InProgress'
                    ? `Ends ${formatCountdown(timeLeft)}`
                    : `Starts ${formatCountdown(timeLeft)}`}
                </span>
                <span style={{ color: '#e2c275', fontWeight: 700 }}>
                  {dist}m {dir}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onViewOnMap(raid.raidId)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  background: 'rgba(30, 41, 59, 0.75)',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Inspect on Map
              </button>
            </div>
          );
        })}
      </div>

      {/* Waypoint Pill when tracking a raid */}
      {trackedRaid && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 18,
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'rgba(11, 14, 21, 0.88)',
            border: '1px solid rgba(212, 175, 55, 0.45)',
            color: '#f3e8c8',
            fontSize: '11px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span>
            Waypoint: {trackedRaid.bossName} ·{' '}
            {computeDistanceMeters(
              playerPos.x,
              playerPos.z,
              trackedRaid.location.x,
              trackedRaid.location.z
            )}
            m{' '}
            {computeCardinalDirection(
              playerPos.x,
              playerPos.z,
              trackedRaid.location.x,
              trackedRaid.location.z
            )}
          </span>
          <button
            type="button"
            onClick={onClearTrack}
            aria-label="Clear tracked raid"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};
