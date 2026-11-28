import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  evaluateTravelCurve,
  SpellTravelCardId,
  SpellTravelEvent,
} from '../../domain/cards/spellTravel';

interface LightRayCharacterProps {
  event: SpellTravelEvent;
  participantIndex: number;
  totalParticipants: number;
}

function getCardPalette(cardId: SpellTravelCardId): {
  core: string;
  aura: string;
  ribbon: string;
} {
  switch (cardId) {
    case 'magnetic_force':
      return { core: '#f0f9ff', aura: '#38bdf8', ribbon: '#60a5fa' };
    case 'drift':
      return { core: '#fdf4ff', aura: '#c084fc', ribbon: '#2dd4bf' };
    case 'accompany':
    case 'return':
    default:
      return { core: '#fefce8', aura: '#fbbf24', ribbon: '#f59e0b' };
  }
}

const TRAIL_SEGMENTS = 18;

/**
 * Renders an anime-inspired humanoid silhouette of radiant light with
 * a trailing multi-segment light ribbon and pooled energy sparks.
 */
export function LightRayCharacter({
  event,
  participantIndex,
  totalParticipants,
}: LightRayCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const trailHistoryRef = useRef<THREE.Vector3[]>([]);
  const trailMeshesRef = useRef<Array<THREE.Mesh | null>>([]);
  const palette = useMemo(() => getCardPalette(event.cardId), [event.cardId]);

  const sparkOffsets = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        angle: (i / 10) * Math.PI * 2,
        radius: 0.45 + (i % 3) * 0.22,
        speed: 3.5 + (i % 4) * 1.1,
        yOff: (i - 5) * 0.18,
      })),
    []
  );
  const sparkRefs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const startMs = event.localStartPerfMs ?? performance.now();
    const elapsedMs = performance.now() - startMs;
    const sample = evaluateTravelCurve(event, elapsedMs, participantIndex, totalParticipants);

    if (groupRef.current) {
      groupRef.current.visible = sample.isTransformedRay;
      groupRef.current.position.set(sample.x, sample.y + 0.95, sample.z);
    }

    if (bodyRef.current) {
      bodyRef.current.rotation.set(sample.pitch, sample.yaw, 0);
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 14) * 0.06;
      bodyRef.current.scale.set(pulse, 1.05, pulse);
    }

    // Update trailing light ribbon history
    if (sample.isTransformedRay) {
      const hist = trailHistoryRef.current;
      hist.unshift(new THREE.Vector3(sample.x, sample.y + 0.95, sample.z));
      if (hist.length > TRAIL_SEGMENTS) hist.pop();

      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const mesh = trailMeshesRef.current[i];
        const pt = hist[i];
        if (!mesh || !pt) {
          if (mesh) mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.position.copy(pt);
        const fade = 1 - i / TRAIL_SEGMENTS;
        mesh.scale.setScalar(0.28 + fade * 0.52);
      }

      const t = clock.getElapsedTime();
      for (let i = 0; i < sparkOffsets.length; i++) {
        const sm = sparkRefs.current[i];
        if (!sm) continue;
        const cfg = sparkOffsets[i];
        const a = cfg.angle + t * cfg.speed;
        sm.position.set(
          Math.cos(a) * cfg.radius,
          cfg.yOff + Math.sin(t * 6 + i) * 0.18,
          Math.sin(a) * cfg.radius
        );
      }
    }
  });

  return (
    <>
      <group ref={groupRef} visible={false}>
        <group ref={bodyRef}>
          {/* Humanoid Head */}
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.17, 12, 12]} />
            <meshBasicMaterial color={palette.core} />
          </mesh>
          {/* Radiant Torso */}
          <mesh position={[0, 0.25, 0]}>
            <capsuleGeometry args={[0.2, 0.48, 6, 12]} />
            <meshBasicMaterial color={palette.core} />
          </mesh>
          {/* Swept-back Energy Arms */}
          <mesh position={[-0.32, 0.22, -0.16]} rotation={[0.6, 0, 0.45]}>
            <capsuleGeometry args={[0.075, 0.46, 4, 8]} />
            <meshBasicMaterial color={palette.aura} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.32, 0.22, -0.16]} rotation={[0.6, 0, -0.45]}>
            <capsuleGeometry args={[0.075, 0.46, 4, 8]} />
            <meshBasicMaterial color={palette.aura} transparent opacity={0.9} />
          </mesh>
          {/* Trailing Energy Legs */}
          <mesh position={[-0.12, -0.36, -0.1]} rotation={[0.35, 0, 0.08]}>
            <capsuleGeometry args={[0.085, 0.56, 4, 8]} />
            <meshBasicMaterial color={palette.aura} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.12, -0.36, -0.1]} rotation={[0.35, 0, -0.08]}>
            <capsuleGeometry args={[0.085, 0.56, 4, 8]} />
            <meshBasicMaterial color={palette.aura} transparent opacity={0.9} />
          </mesh>

          {/* Outer Additive Humanoid Aura */}
          <mesh position={[0, 0.18, 0]}>
            <capsuleGeometry args={[0.42, 0.95, 6, 12]} />
            <meshBasicMaterial
              color={palette.aura}
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Orbiting Energy Sparks */}
          {sparkOffsets.map((_, i) => (
            <mesh
              key={i}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
            >
              <octahedronGeometry args={[0.08, 0]} />
              <meshBasicMaterial
                color={palette.ribbon}
                transparent
                opacity={0.85}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* Trailing Light Ribbon Segments */}
      {Array.from({ length: TRAIL_SEGMENTS }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            trailMeshesRef.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.38, 8, 8]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? palette.ribbon : palette.aura}
            transparent
            opacity={Math.max(0.08, 0.58 * (1 - i / TRAIL_SEGMENTS))}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
