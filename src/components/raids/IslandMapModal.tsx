import React, { useState } from 'react';
import { ISLAND_RADIUS, LANDMARKS } from '../../domain/world/island';
import { Vec3 } from '../../domain/math/vec3';
import { RaidEvent } from '../../domain/raids/types';

interface IslandMapModalProps {
  isOpen: boolean;
  raids: RaidEvent[];
  playerPos: Vec3;
  nowSec: number;
  selectedRaidId: string | null;
  trackedRaidId: string | null;
  onSelectRaid: (raidId: string | null) => void;
  onTrackRaid: (raidId: string | null) => void;
  onSpawnPrototypeRaid: () => void;
  onClose: () => void;
}

const MAP_SIZE = 320;
const WORLD_SPAN = ISLAND_RADIUS * 2.15;

function toMapCoord(v: number): number {
  return ((v + WORLD_SPAN / 2) / WORLD_SPAN) * MAP_SIZE;
}

function tierColor(tier: number): string {
  if (tier >= 5) return '#ef4444';
  if (tier >= 4) return '#f59e0b';
  if (tier === 3) return '#c084fc';
  return '#38bdf8';
}

export const IslandMapModal: React.FC<IslandMapModalProps> = ({
  isOpen,
  raids,
  playerPos,
  nowSec,
  selectedRaidId,
  trackedRaidId,
  onSelectRaid,
  onTrackRaid,
  onSpawnPrototypeRaid,
  onClose,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  const px = toMapCoord(playerPos.x);
  const pz = toMapCoord(playerPos.z);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(680px, 96vw)',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1.5px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
          padding: '18px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.03em' }}>
              Greed Island Tactical Map
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Select a raid marker to inspect boss details & navigate
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onSpawnPrototypeRaid}
              style={{
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1px solid rgba(192, 132, 252, 0.6)',
                background: 'rgba(88, 28, 135, 0.6)',
                color: '#f3e8ff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Trigger Raid (Prototype)
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(30, 41, 59, 0.85)',
                color: '#e2e8f0',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close [M]
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* SVG Island Map */}
          <svg
            width={MAP_SIZE}
            height={MAP_SIZE}
            viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
            style={{
              borderRadius: '12px',
              background: 'radial-gradient(circle, #0c4a6e 0%, #082f49 100%)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              flexShrink: 0,
            }}
          >
            {/* Island landmass */}
            <circle
              cx={MAP_SIZE / 2}
              cy={MAP_SIZE / 2}
              r={(ISLAND_RADIUS / WORLD_SPAN) * MAP_SIZE}
              fill="#365314"
              fillOpacity={0.78}
              stroke="#a3e635"
              strokeOpacity={0.35}
              strokeWidth={2}
            />

            {/* Waypoint line to tracked raid */}
            {trackedRaidId &&
              (() => {
                const tr = visibleRaids.find((r) => r.raidId === trackedRaidId);
                if (!tr) return null;
                return (
                  <line
                    x1={px}
                    y1={pz}
                    x2={toMapCoord(tr.location.x)}
                    y2={toMapCoord(tr.location.z)}
                    stroke="#e879f9"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                );
              })()}

            {/* Permanent Landmarks */}
            {LANDMARKS.map((lm) => {
              const lx = toMapCoord(lm.x);
              const lz = toMapCoord(lm.z);
              return (
                <g key={lm.name}>
                  <circle cx={lx} cy={lz} r={4} fill="#cbd5e1" opacity={0.85} />
                  <text
                    x={lx}
                    y={lz - 7}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#e2e8f0"
                    opacity={0.8}
                  >
                    {lm.name}
                  </text>
                </g>
              );
            })}

            {/* Dynamic Raid Markers */}
            {visibleRaids.map((raid) => {
              const rx = toMapCoord(raid.location.x);
              const rz = toMapCoord(raid.location.z);
              const col = tierColor(raid.tier);
              const isSelected = selectedRaid?.raidId === raid.raidId;
              const isHovered = hoveredId === raid.raidId;
              return (
                <g
                  key={raid.raidId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectRaid(raid.raidId)}
                  onMouseEnter={() => setHoveredId(raid.raidId)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <circle
                    cx={rx}
                    cy={rz}
                    r={isSelected ? 14 : 11}
                    fill={col}
                    fillOpacity={0.22}
                    stroke={col}
                    strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                  />
                  <circle cx={rx} cy={rz} r={5.5} fill={col} />
                  <text
                    x={rx}
                    y={rz + 19}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight="bold"
                    fill="#f8fafc"
                  >
                    {raid.bossName} (T{raid.tier})
                  </text>
                </g>
              );
            })}

            {/* Local Player Marker */}
            <circle cx={px} cy={pz} r={5.5} fill="#38bdf8" stroke="#ffffff" strokeWidth={2} />
          </svg>

          {/* Selected Raid Details */}
          <div
            style={{
              flex: '1 1 240px',
              padding: '14px',
              borderRadius: '12px',
              background: 'rgba(30, 41, 59, 0.72)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {selectedRaid ? (
              <>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#f3e8ff' }}>
                    {selectedRaid.bossName} — {selectedRaid.bossTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                    Tier {selectedRaid.tier} ({'★'.repeat(selectedRaid.tier)}) ·{' '}
                    {selectedRaid.difficulty}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'grid', gap: '5px' }}>
                  <div>
                    <strong>Status:</strong> {selectedRaid.status}
                  </div>
                  <div>
                    <strong>Region:</strong> {selectedRaid.locationLabel} (
                    {Math.round(selectedRaid.location.x)}, {Math.round(selectedRaid.location.z)})
                  </div>
                  <div>
                    <strong>Distance:</strong>{' '}
                    {Math.round(
                      Math.hypot(
                        selectedRaid.location.x - playerPos.x,
                        selectedRaid.location.z - playerPos.z
                      )
                    )}
                    m
                  </div>
                  <div>
                    <strong>Countdown:</strong>{' '}
                    {selectedRaid.status === 'InProgress'
                      ? `${Math.max(0, Math.ceil(selectedRaid.endTime - nowSec))}s left`
                      : `${Math.max(0, Math.ceil(selectedRaid.startTime - nowSec))}s to start`}
                  </div>
                  <div>
                    <strong>Participants:</strong> {selectedRaid.participants.length} /{' '}
                    {selectedRaid.maxParticipants} (Rec: {selectedRaid.recommendedPartySize})
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
                    border: '1px solid rgba(192, 132, 252, 0.65)',
                    background:
                      trackedRaidId === selectedRaid.raidId
                        ? 'rgba(71, 85, 105, 0.8)'
                        : 'linear-gradient(135deg, #7e22ce, #4f46e5)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {trackedRaidId === selectedRaid.raidId
                    ? 'Clear Navigation Waypoint'
                    : 'Navigate to Raid'}
                </button>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                No active or upcoming raids on the island right now. Click{' '}
                <strong>+ Trigger Raid (Prototype)</strong> above to test a raid spawn.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
