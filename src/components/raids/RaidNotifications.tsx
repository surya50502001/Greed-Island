import React from 'react';
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
      {/* Top-right compact Raid Pill (reopen dismissed notifications or open map) */}
      {activeRaids.length > 0 && visibleNotifs.length === 0 && (
        <button
          type="button"
          onClick={onReopenAll}
          style={{
            position: 'fixed',
            top: '58px',
            right: '18px',
            zIndex: 22,
            padding: '6px 12px',
            borderRadius: '999px',
            border: '1px solid rgba(192, 132, 252, 0.7)',
            background: 'rgba(30, 27, 75, 0.85)',
            color: '#f3e8ff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          ⚡ {activeRaids.length} Active Raid{activeRaids.length > 1 ? 's' : ''}
        </button>
      )}

      {/* Active Raid Notification Cards */}
      <div
        style={{
          position: 'fixed',
          top: '58px',
          right: '18px',
          zIndex: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '300px',
          pointerEvents: 'none',
        }}
      >
        {visibleNotifs.map((raid) => {
          const dist = Math.round(
            Math.hypot(raid.location.x - playerPos.x, raid.location.z - playerPos.z)
          );
          const timeLeft =
            raid.status === 'InProgress'
              ? raid.endTime - nowSec
              : raid.startTime - nowSec;
          const isExpiringSoon = raid.status === 'InProgress' && timeLeft < 30;

          return (
            <div
              key={raid.raidId}
              style={{
                pointerEvents: 'auto',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(15, 23, 42, 0.88)',
                border: `1.5px solid ${
                  isExpiringSoon
                    ? 'rgba(239, 68, 68, 0.8)'
                    : raid.status === 'InProgress'
                      ? 'rgba(245, 158, 11, 0.75)'
                      : 'rgba(168, 85, 247, 0.75)'
                }`,
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.48)',
                backdropFilter: 'blur(10px)',
                color: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #581c87, #312e81)',
                      border: '1px solid rgba(216, 180, 254, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                    }}
                  >
                    🐺
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#f3e8ff' }}>
                      {raid.bossName} · {'★'.repeat(raid.tier)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                      {raid.difficulty} Raid · {raid.locationLabel}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(raid.raidId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '2px 4px',
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
                  color: '#e2e8f0',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>
                  {raid.status === 'InProgress'
                    ? isExpiringSoon
                      ? `⚠ Expiring: ${formatCountdown(timeLeft)}`
                      : `Active: ${formatCountdown(timeLeft)}`
                    : `Starts in: ${formatCountdown(timeLeft)}`}
                </span>
                <span style={{ color: '#7dd3fc', fontWeight: 700 }}>{dist}m away</span>
              </div>

              <button
                type="button"
                onClick={() => onViewOnMap(raid.raidId)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '7px',
                  border: '1px solid rgba(192, 132, 252, 0.5)',
                  background: 'rgba(88, 28, 135, 0.55)',
                  color: '#f3e8ff',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                View on Island Map [M]
              </button>
            </div>
          );
        })}
      </div>

      {/* Navigation Waypoint Pill when tracking a raid */}
      {trackedRaid && (
        <div
          style={{
            position: 'fixed',
            top: '94px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 18,
            padding: '5px 12px',
            borderRadius: '999px',
            background: 'rgba(15, 23, 42, 0.82)',
            border: '1px solid rgba(192, 132, 252, 0.6)',
            color: '#e9d5ff',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>
            🧭 {trackedRaid.bossName} ({trackedRaid.locationLabel}) ·{' '}
            {Math.round(
              Math.hypot(
                trackedRaid.location.x - playerPos.x,
                trackedRaid.location.z - playerPos.z
              )
            )}
            m
          </span>
          <button
            type="button"
            onClick={onClearTrack}
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
