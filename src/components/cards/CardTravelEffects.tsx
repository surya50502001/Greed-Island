import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getTravelPhase,
  SpellTravelEvent,
  WeaponSummonEvent,
} from '../../domain/cards/spellTravel';
import { LightRayCharacter } from './LightRayCharacter';

interface CardTravelEffectsProps {
  activeTravels: SpellTravelEvent[];
  activeWeaponSummons: WeaponSummonEvent[];
  playerPositions: Record<string, { x: number; y: number; z: number }>;
}

function getRingColor(cardId: SpellTravelEvent['cardId']): string {
  if (cardId === 'magnetic_force') return '#38bdf8';
  if (cardId === 'drift') return '#c084fc';
  return '#fbbf24';
}

function TravelEventVisual({ event }: { event: SpellTravelEvent }) {
  const launchCircleRef = useRef<THREE.Group>(null);
  const arrivalCircleRef = useRef<THREE.Group>(null);
  const pillarRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => getRingColor(event.cardId), [event.cardId]);

  useFrame(({ clock }) => {
    const startMs = event.localStartPerfMs ?? performance.now();
    const elapsed = performance.now() - startMs;
    const phase = getTravelPhase(event, elapsed);
    const t = clock.getElapsedTime();

    if (launchCircleRef.current) {
      const showLaunch = phase === 'Preparing' || phase === 'Launching' || phase === 'Transforming';
      launchCircleRef.current.visible = showLaunch;
      launchCircleRef.current.rotation.y = t * 1.8;
      const s = showLaunch ? 1 + Math.sin(t * 8) * 0.06 : 1;
      launchCircleRef.current.scale.setScalar(s);
    }

    if (arrivalCircleRef.current) {
      const showArrival = phase === 'Descending' || phase === 'Arriving';
      arrivalCircleRef.current.visible = showArrival;
      arrivalCircleRef.current.rotation.y = -t * 2.2;
    }

    if (pillarRef.current) {
      pillarRef.current.visible = phase === 'Launching' || phase === 'Arriving';
      pillarRef.current.position.set(
        phase === 'Arriving' ? event.destinationX : event.originX,
        (phase === 'Arriving' ? event.destinationY : event.originY) + 8,
        phase === 'Arriving' ? event.destinationZ : event.originZ
      );
    }
  });

  const groupScale = event.participantPlayerIds.length > 1 ? 1.55 : 1.0;

  return (
    <group>
      {/* Departure Magical Circle */}
      <group
        ref={launchCircleRef}
        position={[event.originX, event.originY + 0.08, event.originZ]}
        scale={groupScale}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.9, 40]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.05, 6]} />
          <meshBasicMaterial
            color="#ffffff"
            side={THREE.DoubleSide}
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Arrival Magical Circle */}
      <group
        ref={arrivalCircleRef}
        visible={false}
        position={[event.destinationX, event.destinationY + 0.08, event.destinationZ]}
        scale={groupScale}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 2.0, 40]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Vertical Launch/Arrival Light Pillar */}
      <mesh ref={pillarRef} visible={false}>
        <cylinderGeometry args={[0.85, 1.35, 16, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Individual Humanoid Light Rays for every travelling participant */}
      {event.participantPlayerIds.map((pid, idx) => (
        <LightRayCharacter
          key={`${event.eventId}-${pid}`}
          event={event}
          participantIndex={idx}
          totalParticipants={event.participantPlayerIds.length}
        />
      ))}
    </group>
  );
}

function WeaponSummonVisual({
  event,
  pos,
}: {
  event: WeaponSummonEvent;
  pos: { x: number; y: number; z: number };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const startMs = event.localStartPerfMs ?? performance.now();
    const elapsed = performance.now() - startMs;
    const progress = Math.max(0, Math.min(1, elapsed / event.durationMs));
    const t = clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.visible = elapsed < event.durationMs;
      groupRef.current.position.set(pos.x, pos.y + 1.35, pos.z);
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = t * 4.5;
      ring1Ref.current.scale.setScalar(1.2 - progress * 0.55);
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = t * 3.8;
      ring2Ref.current.rotation.y = t * 2.9;
      ring2Ref.current.scale.setScalar(0.6 + Math.sin(progress * Math.PI) * 0.6);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={ring1Ref}>
        <torusGeometry args={[0.62, 0.025, 8, 32]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.45, 0.02, 8, 28]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <octahedronGeometry args={[0.24, 0]} />
        <meshBasicMaterial
          color="#fef08a"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function CardTravelEffects({
  activeTravels,
  activeWeaponSummons,
  playerPositions,
}: CardTravelEffectsProps) {
  return (
    <>
      {activeTravels.map((ev) => (
        <TravelEventVisual key={ev.eventId} event={ev} />
      ))}
      {activeWeaponSummons.map((ws) => {
        const pos = playerPositions[ws.playerId];
        if (!pos) return null;
        return <WeaponSummonVisual key={ws.eventId} event={ws} pos={pos} />;
      })}
    </>
  );
}
