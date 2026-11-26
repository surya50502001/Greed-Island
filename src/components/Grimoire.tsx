import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CARD_DEFINITIONS, CardId } from '../types/game';
import { GrimoireCard } from './GrimoireCard';

interface GrimoireProps {
  isOpen: boolean;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  onActivateCard: (id: CardId) => void;
  onClose: () => void;
}

const PARTICLE_COUNT = 72;

export function Grimoire({
  isOpen,
  isFlying,
  hasWeapon,
  isInvisible,
  onActivateCard,
  onClose,
}: GrimoireProps) {
  const { camera } = useThree();

  const rootRef = useRef<THREE.Group>(null);
  const bookGroupRef = useRef<THREE.Group>(null);
  const leftCoverRef = useRef<THREE.Group>(null);
  const rightCoverRef = useRef<THREE.Group>(null);
  const flipPage1Ref = useRef<THREE.Mesh>(null);
  const flipPage2Ref = useRef<THREE.Mesh>(null);
  const runeRingRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // Animation progress refs (0..1)
  const summonProgress = useRef(0);
  const openProgress = useRef(0);
  const emergeProgress = useRef(0);
  const activateProgress = useRef(0);

  const [activatingCard, setActivatingCard] = useState<CardId | null>(null);
  const activatingCardRef = useRef<CardId | null>(null);

  // Reusable vectors for camera-relative placement
  const camDir = useRef(new THREE.Vector3());
  const camUp = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  // Reset cursor and internal activation state when closed
  useEffect(() => {
    if (!isOpen) {
      document.body.style.cursor = 'auto';
    } else {
      setActivatingCard(null);
      activatingCardRef.current = null;
      activateProgress.current = 0;
    }
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [isOpen]);

  // Magical particle geometry & attributes
  const { particleGeo, particleSeeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT * 3);

    const palette = [
      new THREE.Color('#38bdf8'),
      new THREE.Color('#c084fc'),
      new THREE.Color('#fde047'),
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const radius = 0.55 + (i % 7) * 0.16;
      const y = ((i % 11) / 11 - 0.3) * 1.4;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      seeds[i * 3] = angle;
      seeds[i * 3 + 1] = radius;
      seeds[i * 3 + 2] = 0.7 + (i % 5) * 0.25;

      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { particleGeo: geo, particleSeeds: seeds };
  }, []);

  useEffect(() => {
    return () => {
      particleGeo.dispose();
    };
  }, [particleGeo]);

  const handleSelectCard = (id: CardId) => {
    if (activatingCardRef.current) return;
    activatingCardRef.current = id;
    setActivatingCard(id);
    activateProgress.current = 0;
  };

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const root = rootRef.current;
    if (!root) return;

    // Drive summon / open / emerge / activate timelines
    if (isOpen) {
      summonProgress.current = Math.min(1, summonProgress.current + dt * 2.8);
      if (summonProgress.current > 0.35) {
        openProgress.current = Math.min(1, openProgress.current + dt * 2.3);
      }
      if (openProgress.current > 0.45 && !activatingCardRef.current) {
        emergeProgress.current = Math.min(1, emergeProgress.current + dt * 2.4);
      }
      if (activatingCardRef.current) {
        activateProgress.current = Math.min(1, activateProgress.current + dt * 2.2);
        if (activateProgress.current >= 1) {
          const chosen = activatingCardRef.current;
          activatingCardRef.current = null;
          setActivatingCard(null);
          onActivateCard(chosen);
          onClose();
        }
      }
    } else {
      emergeProgress.current = Math.max(0, emergeProgress.current - dt * 4.5);
      openProgress.current = Math.max(0, openProgress.current - dt * 3.5);
      summonProgress.current = Math.max(0, summonProgress.current - dt * 3.2);
    }

    const sp = summonProgress.current;
    root.visible = sp > 0.01;
    if (!root.visible) return;

    // Position grimoire cleanly in front of the camera in 3D world space
    camera.getWorldDirection(camDir.current);
    camUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
    targetPos.current
      .copy(camera.position)
      .addScaledVector(camDir.current, 2.05)
      .addScaledVector(camUp.current, -0.26);

    root.position.copy(targetPos.current);
    root.lookAt(camera.position);

    // Subtle materialization scale & hover bob
    const easeOut = 1 - Math.pow(1 - sp, 3);
    root.scale.setScalar(0.1 + easeOut * 0.9);

    if (bookGroupRef.current) {
      bookGroupRef.current.position.y = -0.22 + Math.sin(t * 2.2) * 0.025;
      // Tilt book slightly back so open pages face the viewer
      bookGroupRef.current.rotation.x = 0.46;
    }

    // Animate covers opening
    const op = openProgress.current;
    const coverEase = op * op * (3 - 2 * op);
    if (leftCoverRef.current) {
      leftCoverRef.current.rotation.y = coverEase * 1.18;
    }
    if (rightCoverRef.current) {
      rightCoverRef.current.rotation.y = -coverEase * 1.18;
    }

    // Animate 2 turning parchment pages during opening
    if (flipPage1Ref.current) {
      const p1 = Math.max(0, Math.min(1, (op - 0.15) * 1.6));
      flipPage1Ref.current.visible = p1 > 0.02 && p1 < 0.98;
      flipPage1Ref.current.rotation.y = THREE.MathUtils.lerp(-1.1, 1.1, p1);
    }
    if (flipPage2Ref.current) {
      const p2 = Math.max(0, Math.min(1, (op - 0.35) * 1.6));
      flipPage2Ref.current.visible = p2 > 0.02 && p2 < 0.98;
      flipPage2Ref.current.rotation.y = THREE.MathUtils.lerp(-1.1, 1.1, p2);
    }

    // Rotate arcane rune circle
    if (runeRingRef.current) {
      runeRingRef.current.rotation.z = t * 0.7;
      runeRingRef.current.scale.setScalar(0.3 + easeOut * 0.75);
    }

    // Animate swirling magical particles
    if (particlesRef.current) {
      const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const baseAngle = particleSeeds[i * 3];
        const radius = particleSeeds[i * 3 + 1];
        const speed = particleSeeds[i * 3 + 2];
        const a = baseAngle + t * speed * 1.1;
        const y = ((t * 0.45 * speed + i * 0.13) % 1.6) - 0.45;
        posAttr.setXYZ(i, Math.cos(a) * radius * easeOut, y, Math.sin(a) * radius * easeOut);
      }
      posAttr.needsUpdate = true;
    }
  });

  const activeMap: Record<CardId, boolean> = {
    flight: isFlying,
    weapon: hasWeapon,
    invisibility: isInvisible,
  };

  const cardArcLayout: Array<{ pos: [number, number, number]; rotZ: number }> = [
    { pos: [-0.84, 0.72, 0.08], rotZ: 0.16 },
    { pos: [0, 0.92, 0.16], rotZ: 0 },
    { pos: [0.84, 0.72, 0.08], rotZ: -0.16 },
  ];

  return (
    <group ref={rootRef} visible={false}>
      {/* Warm arcane illumination on book & cards */}
      <pointLight position={[0, 0.5, 0.9]} color="#7dd3fc" intensity={3.2} distance={5} />
      <pointLight position={[0, -0.2, 0.4]} color="#c084fc" intensity={2.0} distance={4} />

      {/* Glowing Rune Circle */}
      <group ref={runeRingRef} position={[0, -0.38, -0.15]} rotation={[-0.35, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.85, 0.91, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.62, 0.65, 6]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Swirling Magical Particles */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          size={0.042}
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Ancient Magical Book */}
      <group ref={bookGroupRef} position={[0, -0.22, 0]}>
        {/* Spine */}
        <mesh position={[0, 0, -0.02]}>
          <cylinderGeometry args={[0.055, 0.055, 0.68, 12]} />
          <meshStandardMaterial color="#1e1030" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Spine gold bands */}
        {[-0.22, 0, 0.22].map((by, idx) => (
          <mesh key={idx} position={[0, by, -0.02]}>
            <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
            <meshStandardMaterial color="#eab308" roughness={0.25} metalness={0.8} />
          </mesh>
        ))}

        {/* Left Cover + Page Block */}
        <group ref={leftCoverRef} position={[-0.03, 0, 0]}>
          <mesh position={[-0.25, 0, -0.025]}>
            <boxGeometry args={[0.5, 0.68, 0.035]} />
            <meshStandardMaterial color="#2b1745" roughness={0.65} />
          </mesh>
          {/* Gold trim */}
          <mesh position={[-0.48, 0, -0.025]}>
            <boxGeometry args={[0.04, 0.69, 0.042]} />
            <meshStandardMaterial color="#eab308" roughness={0.3} metalness={0.75} />
          </mesh>
          {/* Parchment pages */}
          <mesh position={[-0.23, 0, 0.015]}>
            <boxGeometry args={[0.45, 0.62, 0.045]} />
            <meshStandardMaterial color="#f3e5c8" roughness={0.85} />
          </mesh>
          {/* Glowing arcane rune lines on left page */}
          <mesh position={[-0.23, 0.02, 0.04]}>
            <ringGeometry args={[0.08, 0.1, 24]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
          </mesh>
        </group>

        {/* Right Cover + Page Block */}
        <group ref={rightCoverRef} position={[0.03, 0, 0]}>
          <mesh position={[0.25, 0, -0.025]}>
            <boxGeometry args={[0.5, 0.68, 0.035]} />
            <meshStandardMaterial color="#2b1745" roughness={0.65} />
          </mesh>
          {/* Gold trim */}
          <mesh position={[0.48, 0, -0.025]}>
            <boxGeometry args={[0.04, 0.69, 0.042]} />
            <meshStandardMaterial color="#eab308" roughness={0.3} metalness={0.75} />
          </mesh>
          {/* Parchment pages */}
          <mesh position={[0.23, 0, 0.015]}>
            <boxGeometry args={[0.45, 0.62, 0.045]} />
            <meshStandardMaterial color="#f3e5c8" roughness={0.85} />
          </mesh>
          {/* Glowing arcane rune lines on right page */}
          <mesh position={[0.23, 0.02, 0.04]}>
            <ringGeometry args={[0.08, 0.1, 6]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={0.75} />
          </mesh>
        </group>

        {/* Animated Turning Pages */}
        <mesh ref={flipPage1Ref} visible={false} position={[0, 0, 0.035]}>
          <boxGeometry args={[0.42, 0.6, 0.008]} />
          <meshStandardMaterial color="#faf0dc" emissive="#38bdf8" emissiveIntensity={0.2} />
        </mesh>
        <mesh ref={flipPage2Ref} visible={false} position={[0, 0, 0.04]}>
          <boxGeometry args={[0.42, 0.6, 0.008]} />
          <meshStandardMaterial color="#faf0dc" emissive="#c084fc" emissiveIntensity={0.2} />
        </mesh>
      </group>

      {/* 3 Emerging Holographic Cards in an Arc */}
      {CARD_DEFINITIONS.map((card, idx) => (
        <GrimoireCard
          key={card.id}
          card={card}
          isActive={activeMap[card.id]}
          emergeProgress={emergeProgress}
          activatingCard={activatingCard}
          activateProgress={activateProgress}
          basePos={cardArcLayout[idx].pos}
          baseRotZ={cardArcLayout[idx].rotZ}
          onSelect={handleSelectCard}
        />
      ))}
    </group>
  );
}
