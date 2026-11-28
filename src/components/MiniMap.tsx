import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { ISLAND_RADIUS, LANDMARKS } from '../domain/world/island';
import {
  computeCardinalDirection,
  computeDistanceMeters,
  WORLD_MAP_SPAN,
  worldToMapPoint,
  yawToMapRotationDeg,
} from '../domain/world/mapProjection';
import { RaidEvent } from '../domain/raids/types';
import { RemotePlayerSnapshot } from '../network/SignalRClient';

interface MiniMapProps {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerYawRef: React.MutableRefObject<number>;
  remoteSnapshotsRef: React.MutableRefObject<Record<string, RemotePlayerSnapshot>>;
  raids: RaidEvent[];
  trackedRaidId: string | null;
  isCompact?: boolean;
  hidden?: boolean;
  onOpenFullMap: () => void;
}

interface MiniMapSample {
  x: number;
  z: number;
  yaw: number;
  remotes: Array<{ playerId: string; x: number; z: number }>;
}

const MINI_ZOOM = 1.65;

export const MiniMap: React.FC<MiniMapProps> = ({
  playerPosRef,
  playerYawRef,
  remoteSnapshotsRef,
  raids,
  trackedRaidId,
  isCompact = false,
  hidden = false,
  onOpenFullMap,
}) => {
  const [sample, setSample] = useState<MiniMapSample>(() => ({
    x: playerPosRef.current.x,
    z: playerPosRef.current.z,
    yaw: playerYawRef.current,
    remotes: [],
  }));

  useEffect(() => {
    if (hidden) return;
    let rafId = 0;
    let lastUpdate = 0;

    const tick = (now: number) => {
      if (now - lastUpdate >= 60) {
        lastUpdate = now;
        const remotes: Array<{ playerId: string; x: number; z: number }> = [];
        for (const snap of Object.values(remoteSnapshotsRef.current)) {
          if (snap.isAlive && !snap.isInvisible) {
            remotes.push({ playerId: snap.playerId, x: snap.x, z: snap.z });
          }
        }
        setSample({
          x: playerPosRef.current.x,
          z: playerPosRef.current.z,
          yaw: playerYawRef.current,
          remotes,
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hidden, playerPosRef, playerYawRef, remoteSnapshotsRef]);

  if (hidden) return null;

  const size = isCompact ? 104 : 132;
  const half = size / 2;
  const activeRaids = raids.filter(
    (r) => r.status === 'Upcoming' || r.status === 'Gathering' || r.status === 'InProgress'
  );
  const focusRaid =
    activeRaids.find((r) => r.raidId === trackedRaidId) ??
    activeRaids.find((r) => r.status === 'InProgress') ??
    activeRaids[0] ??
    null;

  const islandOrigin = worldToMapPoint(0, 0, size, MINI_ZOOM, sample.x, sample.z);
  const islandPxRadius = (ISLAND_RADIUS / WORLD_MAP_SPAN) * size * MINI_ZOOM;
  const playerRotDeg = yawToMapRotationDeg(sample.yaw);

  const focusDist = focusRaid
    ? computeDistanceMeters(sample.x, sample.z, focusRaid.location.x, focusRaid.location.z)
    : null;
  const focusDir = focusRaid
    ? computeCardinalDirection(sample.x, sample.z, focusRaid.location.x, focusRaid.location.z)
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: 'calc(12px + env(safe-area-inset-left, 0px))',
        zIndex: 23,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '5px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: 'rgba(10, 14, 22, 0.9)',
          border: '2px solid rgba(212, 175, 55, 0.55)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onClick={onOpenFullMap}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          {/* Sea background */}
          <rect width={size} height={size} fill="#081421" />

          {/* Actual Island Landmass */}
          <circle
            cx={islandOrigin.x}
            cy={islandOrigin.y}
            r={islandPxRadius}
            fill="#1f2d24"
            stroke="#5c7c54"
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />
          <circle
            cx={islandOrigin.x}
            cy={islandOrigin.y}
            r={islandPxRadius * 0.62}
            fill="none"
            stroke="#94a3b8"
            strokeOpacity={0.14}
            strokeWidth={1}
          />

          {/* Landmarks */}
          {LANDMARKS.map((lm) => {
            const pt = worldToMapPoint(lm.x, lm.z, size, MINI_ZOOM, sample.x, sample.z);
            return (
              <circle
                key={lm.name}
                cx={pt.x}
                cy={pt.y}
                r={2.5}
                fill="#cbd5e1"
                fillOpacity={0.85}
              />
            );
          })}

          {/* Tracked / Focus Raid Waypoint Line */}
          {focusRaid &&
            (() => {
              const rp = worldToMapPoint(
                focusRaid.location.x,
                focusRaid.location.z,
                size,
                MINI_ZOOM,
                sample.x,
                sample.z
              );
              return (
                <line
                  x1={half}
                  y1={half}
                  x2={rp.x}
                  y2={rp.y}
                  stroke="#d97706"
                  strokeOpacity={0.65}
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />
              );
            })()}

          {/* Remote Multiplayer Players */}
          {sample.remotes.map((rp) => {
            const pt = worldToMapPoint(rp.x, rp.z, size, MINI_ZOOM, sample.x, sample.z);
            return (
              <circle
                key={rp.playerId}
                cx={pt.x}
                cy={pt.y}
                r={3}
                fill="#f87171"
                stroke="#0f172a"
                strokeWidth={1}
              />
            );
          })}

          {/* Raid Markers (clamped to rim if off-screen so direction stays visible) */}
          {activeRaids.map((raid) => {
            const pt = worldToMapPoint(
              raid.location.x,
              raid.location.z,
              size,
              MINI_ZOOM,
              sample.x,
              sample.z
            );
            const margin = 9;
            const cx = Math.max(margin, Math.min(size - margin, pt.x));
            const cy = Math.max(margin, Math.min(size - margin, pt.y));
            const isInProgress = raid.status === 'InProgress';
            return (
              <g key={raid.raidId}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isInProgress ? 5.5 : 4.5}
                  fill={isInProgress ? '#dc2626' : '#d97706'}
                  stroke="#fef3c7"
                  strokeWidth={1.2}
                />
              </g>
            );
          })}

          {/* Center Player Directional Arrow */}
          <g transform={`translate(${half}, ${half}) rotate(${playerRotDeg})`}>
            <polygon
              points="0,-7 5,5 0,2.5 -5,5"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </g>
        </svg>

        {/* Compass Rim Labels */}
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '9px',
            fontWeight: 800,
            color: '#e2c275',
            pointerEvents: 'none',
            letterSpacing: '0.06em',
          }}
        >
          N
        </span>
        <span
          style={{
            position: 'absolute',
            bottom: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '8px',
            fontWeight: 700,
            color: '#94a3b8',
            pointerEvents: 'none',
          }}
        >
          S
        </span>
        <span
          style={{
            position: 'absolute',
            left: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '8px',
            fontWeight: 700,
            color: '#94a3b8',
            pointerEvents: 'none',
          }}
        >
          W
        </span>
        <span
          style={{
            position: 'absolute',
            right: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '8px',
            fontWeight: 700,
            color: '#94a3b8',
            pointerEvents: 'none',
          }}
        >
          E
        </span>

        {/* Expand Full Map Button */}
        <button
          type="button"
          aria-label="Expand Full Map"
          title="Expand Map [M]"
          onClick={onOpenFullMap}
          style={{
            position: 'absolute',
            right: '10px',
            bottom: '10px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: '1px solid rgba(212, 175, 55, 0.45)',
            background: 'rgba(11, 14, 21, 0.92)',
            color: '#f3e8c8',
            fontSize: '11px',
            fontWeight: 700,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          ⤢
        </button>
      </div>

      {/* Compact Active Raid Navigation Pill */}
      {focusRaid && focusDist !== null && focusDir && (
        <button
          type="button"
          onClick={onOpenFullMap}
          style={{
            pointerEvents: 'auto',
            padding: '4px 9px',
            borderRadius: '8px',
            background: 'rgba(10, 14, 22, 0.86)',
            border: `1px solid ${
              focusRaid.status === 'InProgress'
                ? 'rgba(220, 38, 38, 0.55)'
                : 'rgba(217, 119, 6, 0.5)'
            }`,
            color: '#f8fafc',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {focusRaid.bossName} · {focusDist}m {focusDir}
        </button>
      )}
    </div>
  );
};
