import React, { useRef, useState } from 'react';
import { ISLAND_RADIUS, LANDMARKS } from '../../domain/world/island';
import {
  computeCardinalDirection,
  computeDistanceMeters,
  WORLD_MAP_SPAN,
  worldToMapPoint,
  yawToMapRotationDeg,
} from '../../domain/world/mapProjection';
import { Vec3 } from '../../domain/math/vec3';
import { RaidEvent } from '../../domain/raids/types';
import { RemotePlayerSnapshot } from '../../network/SignalRClient';

interface IslandMapModalProps {
  isOpen: boolean;
  raids: RaidEvent[];
  playerPos: Vec3;
  playerYaw?: number;
  remotePlayers?: RemotePlayerSnapshot[];
  nowSec: number;
  selectedRaidId: string | null;
  trackedRaidId: string | null;
  onSelectRaid: (raidId: string | null) => void;
  onTrackRaid: (raidId: string | null) => void;
  onSpawnPrototypeRaid: () => void;
  onClose: () => void;
}

const MAP_SIZE = 340;

function raidStatusAccent(status: RaidEvent['status']): { color: string; label: string } {
  switch (status) {
    case 'InProgress':
      return { color: '#dc2626', label: 'ACTIVE' };
    case 'Gathering':
      return { color: '#d97706', label: 'GATHERING' };
    case 'Upcoming':
      return { color: '#ca8a04', label: 'UPCOMING' };
    case 'Completed':
      return { color: '#16a34a', label: 'COMPLETED' };
    default:
      return { color: '#64748b', label: status.toUpperCase() };
  }
}

export const IslandMapModal: React.FC<IslandMapModalProps> = ({
  isOpen,
  raids,
  playerPos,
  playerYaw = 0,
  remotePlayers = [],
  nowSec,
  selectedRaidId,
  trackedRaidId,
  onSelectRaid,
  onTrackRaid,
  onSpawnPrototypeRaid,
  onClose,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  if (!isOpen) return null;

  const visibleRaids = raids.filter(
    (r) =>
      r.status === 'Upcoming' ||
      r.status === 'Gathering' ||
      r.status === 'InProgress'
  );

  const selectedRaid =
    visibleRaids.find((r) => r.raidId === selectedRaidId) ??
    visibleRaids[0] ??
    null;

  const visibleRemotes = remotePlayers.filter((rp) => rp.isAlive && !rp.isInvisible);
  const islandCenter = worldToMapPoint(0, 0, MAP_SIZE, zoom, pan.x, pan.z);
  const islandPxRadius = (ISLAND_RADIUS / WORLD_MAP_SPAN) * MAP_SIZE * zoom;
  const playerPt = worldToMapPoint(playerPos.x, playerPos.z, MAP_SIZE, zoom, pan.x, pan.z);
  const playerRotDeg = yawToMapRotationDeg(playerYaw);

  const handlePanStart = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const handlePanMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    const worldPerPx = WORLD_MAP_SPAN / (MAP_SIZE * zoom);
    setPan((prev) => ({
      x: Math.max(-ISLAND_RADIUS, Math.min(ISLAND_RADIUS, prev.x - dx * worldPerPx)),
      z: Math.max(-ISLAND_RADIUS, Math.min(ISLAND_RADIUS, prev.z - dy * worldPerPx)),
    }));
  };

  const handlePanEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        background: 'rgba(5, 8, 14, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(760px, 96vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '14px',
          background: 'rgba(13, 17, 26, 0.98)',
          border: '1px solid rgba(212, 175, 55, 0.32)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.72)',
          padding: '16px',
          color: '#f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
            paddingBottom: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.04em', color: '#f3e8c8' }}>
              GREED ISLAND · WORLD MAP
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Drag to pan · Pinch or use zoom controls · Tap a raid marker to inspect
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onSpawnPrototypeRaid}
              style={{
                padding: '6px 11px',
                borderRadius: '7px',
                border: '1px solid rgba(217, 119, 6, 0.5)',
                background: 'rgba(120, 53, 15, 0.35)',
                color: '#fde68a',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Spawn Raid
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px',
                minHeight: '36px',
                borderRadius: '7px',
                border: '1px solid rgba(226, 232, 240, 0.24)',
                background: 'rgba(30, 41, 59, 0.9)',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✕ Close [M]
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Interactive World Map Canvas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: `${MAP_SIZE}px`, maxWidth: '100%' }}>
              <svg
                width={MAP_SIZE}
                height={MAP_SIZE}
                viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
                onPointerDown={handlePanStart}
                onPointerMove={handlePanMove}
                onPointerUp={handlePanEnd}
                onPointerCancel={handlePanEnd}
                onWheel={(e) => {
                  e.preventDefault();
                  setZoom((z) => Math.max(1, Math.min(2.6, Number((z + (e.deltaY < 0 ? 0.25 : -0.25)).toFixed(2)))));
                }}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: '10px',
                  background: '#081421',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  touchAction: 'none',
                  cursor: 'grab',
                  display: 'block',
                }}
              >
                {/* Island Landmass & Contour Rings */}
                <circle
                  cx={islandCenter.x}
                  cy={islandCenter.y}
                  r={islandPxRadius}
                  fill="#1f2d24"
                  stroke="#5c7c54"
                  strokeOpacity={0.65}
                  strokeWidth={2}
                />
                <circle
                  cx={islandCenter.x}
                  cy={islandCenter.y}
                  r={islandPxRadius * 0.62}
                  fill="none"
                  stroke="#94a3b8"
                  strokeOpacity={0.14}
                  strokeWidth={1}
                />
                <circle
                  cx={islandCenter.x}
                  cy={islandCenter.y}
                  r={islandPxRadius * 0.28}
                  fill="none"
                  stroke="#94a3b8"
                  strokeOpacity={0.12}
                  strokeWidth={1}
                />

                {/* Tracked Raid Route */}
                {trackedRaidId &&
                  (() => {
                    const tr = visibleRaids.find((r) => r.raidId === trackedRaidId);
                    if (!tr) return null;
                    const rp = worldToMapPoint(tr.location.x, tr.location.z, MAP_SIZE, zoom, pan.x, pan.z);
                    return (
                      <line
                        x1={playerPt.x}
                        y1={playerPt.y}
                        x2={rp.x}
                        y2={rp.y}
                        stroke="#d97706"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                      />
                    );
                  })()}

                {/* Permanent Landmarks */}
                {LANDMARKS.map((lm) => {
                  const pt = worldToMapPoint(lm.x, lm.z, MAP_SIZE, zoom, pan.x, pan.z);
                  return (
                    <g key={lm.name}>
                      <circle cx={pt.x} cy={pt.y} r={3.5} fill="#cbd5e1" opacity={0.9} />
                      <text
                        x={pt.x}
                        y={pt.y - 7}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight="600"
                        fill="#cbd5e1"
                      >
                        {lm.name}
                      </text>
                    </g>
                  );
                })}

                {/* Remote Players (actual live multiplayer snapshots) */}
                {visibleRemotes.map((rp) => {
                  const pt = worldToMapPoint(rp.x, rp.z, MAP_SIZE, zoom, pan.x, pan.z);
                  return (
                    <g key={rp.playerId}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={4.2}
                        fill="#ef4444"
                        stroke="#0f172a"
                        strokeWidth={1.3}
                      />
                      <text
                        x={pt.x}
                        y={pt.y + 11}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill="#fca5a5"
                      >
                        {rp.characterName}
                      </text>
                    </g>
                  );
                })}

                {/* Raid Markers */}
                {visibleRaids.map((raid) => {
                  const pt = worldToMapPoint(
                    raid.location.x,
                    raid.location.z,
                    MAP_SIZE,
                    zoom,
                    pan.x,
                    pan.z
                  );
                  const { color } = raidStatusAccent(raid.status);
                  const isSelected = selectedRaid?.raidId === raid.raidId;
                  const isHovered = hoveredId === raid.raidId;
                  return (
                    <g
                      key={raid.raidId}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRaid(raid.raidId);
                      }}
                      onMouseEnter={() => setHoveredId(raid.raidId)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 13 : 10}
                        fill={color}
                        fillOpacity={0.2}
                        stroke={color}
                        strokeWidth={isSelected || isHovered ? 2 : 1.3}
                      />
                      <circle cx={pt.x} cy={pt.y} r={4.5} fill={color} stroke="#fef3c7" strokeWidth={1} />
                      <text
                        x={pt.x}
                        y={pt.y + 17}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight="bold"
                        fill="#fef3c7"
                      >
                        {raid.bossName} (T{raid.tier})
                      </text>
                    </g>
                  );
                })}

                {/* Local Player Directional Arrow */}
                <g transform={`translate(${playerPt.x}, ${playerPt.y}) rotate(${playerRotDeg})`}>
                  <polygon
                    points="0,-8 6,6 0,3 -6,6"
                    fill="#f8fafc"
                    stroke="#0f172a"
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                  />
                </g>
              </svg>

              {/* Compass N */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: '#e2c275',
                  pointerEvents: 'none',
                }}
              >
                N
              </div>
            </div>

            {/* Zoom & Pan Controls */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {[1, 1.5, 2.2].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  style={{
                    padding: '4px 9px',
                    borderRadius: '6px',
                    border: `1px solid ${
                      Math.abs(zoom - z) < 0.15
                        ? 'rgba(212, 175, 55, 0.7)'
                        : 'rgba(148, 163, 184, 0.25)'
                    }`,
                    background:
                      Math.abs(zoom - z) < 0.15
                        ? 'rgba(212, 175, 55, 0.18)'
                        : 'rgba(30, 41, 59, 0.75)',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {z}×
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPan({ x: playerPos.x, z: playerPos.z });
                  setZoom(1.65);
                }}
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  background: 'rgba(30, 41, 59, 0.75)',
                  color: '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Center on You
              </button>
              <button
                type="button"
                onClick={() => {
                  setPan({ x: 0, z: 0 });
                  setZoom(1);
                }}
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  background: 'rgba(30, 41, 59, 0.75)',
                  color: '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Right Column: Selected Raid + Legend */}
          <div
            style={{
              flex: '1 1 250px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Raid Details Card */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(20, 26, 38, 0.9)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {selectedRaid ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#f3e8c8' }}>
                        {selectedRaid.bossName} — {selectedRaid.bossTitle}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Tier {selectedRaid.tier} · {selectedRaid.difficulty}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: `1px solid ${raidStatusAccent(selectedRaid.status).color}`,
                        color: '#f8fafc',
                      }}
                    >
                      {raidStatusAccent(selectedRaid.status).label}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'grid', gap: '5px' }}>
                    <div>
                      <strong>Location:</strong> {selectedRaid.locationLabel} (
                      {Math.round(selectedRaid.location.x)}, {Math.round(selectedRaid.location.z)})
                    </div>
                    <div>
                      <strong>Distance:</strong>{' '}
                      {computeDistanceMeters(
                        playerPos.x,
                        playerPos.z,
                        selectedRaid.location.x,
                        selectedRaid.location.z
                      )}
                      m{' '}
                      {computeCardinalDirection(
                        playerPos.x,
                        playerPos.z,
                        selectedRaid.location.x,
                        selectedRaid.location.z
                      )}
                    </div>
                    <div>
                      <strong>Timer:</strong>{' '}
                      {selectedRaid.status === 'InProgress'
                        ? `${Math.max(0, Math.ceil(selectedRaid.endTime - nowSec))}s remaining`
                        : `${Math.max(0, Math.ceil(selectedRaid.startTime - nowSec))}s until start`}
                    </div>
                    <div>
                      <strong>Participants:</strong> {selectedRaid.participants.length} /{' '}
                      {selectedRaid.maxParticipants} (Rec: {selectedRaid.recommendedPartySize})
                    </div>
                    <div>
                      <strong>Rewards:</strong> Boss Card Drops & Upgrade Duplicates
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onTrackRaid(
                        trackedRaidId === selectedRaid.raidId ? null : selectedRaid.raidId
                      )
                    }
                    style={{
                      marginTop: '4px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(212, 175, 55, 0.55)',
                      background:
                        trackedRaidId === selectedRaid.raidId
                          ? 'rgba(51, 65, 85, 0.85)'
                          : 'rgba(146, 64, 14, 0.65)',
                      color: '#fef3c7',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {trackedRaidId === selectedRaid.raidId
                      ? 'Clear Waypoint'
                      : 'Set Navigation Waypoint'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  No active or upcoming raids on the island right now. Use{' '}
                  <strong>+ Spawn Raid</strong> above to trigger a raid event.
                </div>
              )}
            </div>

            {/* Map Legend */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(20, 26, 38, 0.72)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '8px',
                fontSize: '11px',
                color: '#cbd5e1',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f8fafc', display: 'inline-block' }} />
                You (Heading)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                Other Players ({visibleRemotes.length})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#cbd5e1', display: 'inline-block' }} />
                Landmarks
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
                Raid / Boss
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
