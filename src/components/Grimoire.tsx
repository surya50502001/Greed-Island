/**
 * Grimoire.tsx — Premium 3D Magical Book (R3F / Three.js)
 *
 * Renders the physical book as a 3D artifact floating in front of the camera.
 * Visual upgrade: aged leather cover, embossed gold borders, corner protectors,
 * engraved rune details, parchment pages with ruling lines, and weighted animations.
 *
 * Card browsing is handled by GrimoireOverlay (DOM layer).
 * This component is purely the 3D book presentation + shader prewarming.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface GrimoireProps {
  isOpen: boolean;
}

const PARTICLE_COUNT = 48;

// ─── Color palette ────────────────────────────────────────────────────────────
const LEATHER_DARK  = '#1a0d2e';
const LEATHER_MID   = '#241540';
const GOLD_LIGHT    = '#f5c842';
const GOLD_MID      = '#c9960a';
const PARCHMENT     = '#f0e0b8';
const PARCHMENT_MID = '#e8d4a0';
const INK_DARK      = '#2a1a08';

export function Grimoire({ isOpen }: GrimoireProps) {
  const { camera, gl, scene } = useThree();
  const hasPrewarmedRef = useRef(false);

  const rootRef       = useRef<THREE.Group>(null);
  const bookGroupRef  = useRef<THREE.Group>(null);
  const leftCoverRef  = useRef<THREE.Group>(null);
  const rightCoverRef = useRef<THREE.Group>(null);
  const flipPage1Ref  = useRef<THREE.Mesh>(null);
  const flipPage2Ref  = useRef<THREE.Mesh>(null);
  const runeRingRef   = useRef<THREE.Group>(null);
  const particlesRef  = useRef<THREE.Points>(null);
  const ambientGlowRef= useRef<THREE.PointLight>(null);

  // Animation progress refs (0..1)
  const summonProgress = useRef(0);
  const openProgress   = useRef(0);

  // Reusable vectors
  const camDir    = useRef(new THREE.Vector3());
  const camUp     = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  // ─── Shader Prewarm ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasPrewarmedRef.current || !rootRef.current) return;
    hasPrewarmedRef.current = true;
    const root = rootRef.current;
    root.visible = true;
    root.scale.setScalar(0.0001);
    gl.compile(scene, camera);
    root.visible = false;
    root.scale.setScalar(1);
  }, [gl, scene, camera]);

  // ─── Particle System ─────────────────────────────────────────────────────────
  const { particleGeo, particleSeeds } = useMemo(() => {
    const geo       = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors    = new Float32Array(PARTICLE_COUNT * 3);
    const seeds     = new Float32Array(PARTICLE_COUNT * 3);

    const palette = [
      new THREE.Color('#f5c842'),
      new THREE.Color('#e8b430'),
      new THREE.Color('#fde68a'),
      new THREE.Color('#c084fc'),
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle  = (i / PARTICLE_COUNT) * Math.PI * 2;
      const radius = 0.5 + (i % 5) * 0.14;
      const y      = ((i % 9) / 9 - 0.3) * 1.2;

      positions[i * 3]     = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      seeds[i * 3]     = angle;
      seeds[i * 3 + 1] = radius;
      seeds[i * 3 + 2] = 0.6 + (i % 4) * 0.2;

      const c = palette[i % palette.length];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    return { particleGeo: geo, particleSeeds: seeds };
  }, []);

  useEffect(() => () => { particleGeo.dispose(); }, [particleGeo]);

  // ─── Main Animation Loop ─────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t  = clock.getElapsedTime();
    const root = rootRef.current;
    if (!root) return;

    if (isOpen) {
      summonProgress.current = Math.min(1, summonProgress.current + dt * 2.4);
      if (summonProgress.current > 0.3) {
        openProgress.current = Math.min(1, openProgress.current + dt * 1.9);
      }
    } else {
      openProgress.current   = Math.max(0, openProgress.current   - dt * 3.5);
      summonProgress.current = Math.max(0, summonProgress.current - dt * 3.0);
    }

    const sp = summonProgress.current;
    root.visible = sp > 0.005;
    if (!root.visible) return;

    // Position in front of camera
    camera.getWorldDirection(camDir.current);
    camUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const rightVec = new THREE.Vector3().crossVectors(camDir.current, camUp.current).normalize();
    targetPos.current
      .copy(camera.position)
      .addScaledVector(camDir.current, 1.9)
      .addScaledVector(camUp.current, -0.32)
      .addScaledVector(rightVec, -0.18);

    root.position.copy(targetPos.current);
    root.lookAt(camera.position);

    const easeOut = 1 - Math.pow(1 - sp, 3);
    root.scale.setScalar(0.08 + easeOut * 0.92);

    if (bookGroupRef.current) {
      bookGroupRef.current.position.y = -0.2 + Math.sin(t * 1.8) * 0.018;
      bookGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        bookGroupRef.current.rotation.x, 0.44, 0.08
      );
    }

    // Cover open/close animation
    const op  = openProgress.current;
    const cov = op * op * (3 - 2 * op); // smoothstep
    if (leftCoverRef.current) {
      leftCoverRef.current.rotation.y = THREE.MathUtils.lerp(
        leftCoverRef.current.rotation.y, cov * 1.22, 0.1
      );
    }
    if (rightCoverRef.current) {
      rightCoverRef.current.rotation.y = THREE.MathUtils.lerp(
        rightCoverRef.current.rotation.y, -cov * 1.22, 0.1
      );
    }

    // Page turns during opening
    if (flipPage1Ref.current) {
      const p1 = THREE.MathUtils.clamp((op - 0.12) * 1.7, 0, 1);
      flipPage1Ref.current.visible = p1 > 0.02 && p1 < 0.98;
      flipPage1Ref.current.rotation.y = THREE.MathUtils.lerp(-1.05, 1.05, p1);
    }
    if (flipPage2Ref.current) {
      const p2 = THREE.MathUtils.clamp((op - 0.3) * 1.7, 0, 1);
      flipPage2Ref.current.visible = p2 > 0.02 && p2 < 0.98;
      flipPage2Ref.current.rotation.y = THREE.MathUtils.lerp(-1.05, 1.05, p2);
    }

    // Rune ring rotation
    if (runeRingRef.current) {
      runeRingRef.current.rotation.z = t * 0.55;
      runeRingRef.current.scale.setScalar(0.25 + easeOut * 0.78);
    }

    // Particle swirl
    if (particlesRef.current) {
      const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const baseAngle = particleSeeds[i * 3];
        const radius    = particleSeeds[i * 3 + 1];
        const speed     = particleSeeds[i * 3 + 2];
        const a = baseAngle + t * speed * 0.9;
        const y = ((t * 0.35 * speed + i * 0.11) % 1.4) - 0.4;
        posAttr.setXYZ(i,
          Math.cos(a) * radius * easeOut,
          y,
          Math.sin(a) * radius * easeOut
        );
      }
      posAttr.needsUpdate = true;
    }

    // Ambient glow pulse
    if (ambientGlowRef.current) {
      ambientGlowRef.current.intensity = easeOut * 0.4 + Math.sin(t * 2.5) * 0.06;
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {/* Warm glow from book */}
      <pointLight
        ref={ambientGlowRef}
        color="#f5c842"
        intensity={0}
        distance={2.5}
        decay={2}
        position={[0, 0.1, 0.05]}
      />

      {/* ── Rune Ring ── */}
      <group ref={runeRingRef} position={[0, -0.42, -0.12]} rotation={[-0.3, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.78, 0.84, 56]} />
          <meshBasicMaterial color={GOLD_LIGHT} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.56, 0.60, 6]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.32, 0.35, 3]} />
          <meshBasicMaterial color={GOLD_LIGHT} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* ── Particles ── */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          size={0.034}
          vertexColors
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── THE PHYSICAL BOOK ── */}
      <group ref={bookGroupRef} position={[0, -0.2, 0]}>

        {/* Spine cylinder */}
        <mesh position={[0, 0, -0.022]}>
          <cylinderGeometry args={[0.052, 0.052, 0.72, 16]} />
          <meshStandardMaterial color={LEATHER_DARK} roughness={0.7} metalness={0.15} />
        </mesh>
        {/* 5 gold spine bands */}
        {[-0.28, -0.14, 0, 0.14, 0.28].map((by, idx) => (
          <mesh key={idx} position={[0, by, -0.022]}>
            <cylinderGeometry args={[0.058, 0.058, 0.025, 16]} />
            <meshStandardMaterial
              color={GOLD_MID}
              roughness={0.2}
              metalness={0.85}
              emissive={GOLD_LIGHT}
              emissiveIntensity={0.08}
            />
          </mesh>
        ))}

        {/* ── LEFT COVER ── */}
        <group ref={leftCoverRef} position={[-0.028, 0, 0]}>
          {/* Leather body */}
          <mesh position={[-0.26, 0, -0.024]}>
            <boxGeometry args={[0.52, 0.72, 0.038]} />
            <meshStandardMaterial color={LEATHER_DARK} roughness={0.72} metalness={0.05} />
          </mesh>
          {/* Gold trims — left edge, top, bottom */}
          <mesh position={[-0.498, 0, -0.024]}>
            <boxGeometry args={[0.038, 0.73, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          <mesh position={[-0.26, 0.355, -0.024]}>
            <boxGeometry args={[0.52, 0.036, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          <mesh position={[-0.26, -0.355, -0.024]}>
            <boxGeometry args={[0.52, 0.036, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          {/* Corner protectors */}
          <mesh position={[-0.49, 0.345, -0.016]}>
            <boxGeometry args={[0.055, 0.055, 0.052]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.18} metalness={0.9} emissive={GOLD_LIGHT} emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[-0.49, -0.345, -0.016]}>
            <boxGeometry args={[0.055, 0.055, 0.052]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.18} metalness={0.9} />
          </mesh>
          {/* Embossed central sigil */}
          <mesh position={[-0.26, 0.04, -0.004]}>
            <ringGeometry args={[0.08, 0.1, 32]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.3} metalness={0.75} emissive={GOLD_LIGHT} emissiveIntensity={0.1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-0.26, 0.04, -0.002]}>
            <ringGeometry args={[0.055, 0.065, 6]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.2} metalness={0.85} side={THREE.DoubleSide} />
          </mesh>
          {/* Parchment page block */}
          <mesh position={[-0.238, 0, 0.014]}>
            <boxGeometry args={[0.46, 0.65, 0.05]} />
            <meshStandardMaterial color={PARCHMENT} roughness={0.9} />
          </mesh>
          {/* Page gold edges */}
          <mesh position={[-0.238, 0.325, 0.014]}>
            <boxGeometry args={[0.46, 0.006, 0.05]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[-0.238, -0.325, 0.014]}>
            <boxGeometry args={[0.46, 0.006, 0.05]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Ruling ink lines */}
          {[-0.18, -0.08, 0.02, 0.12, 0.22].map((y, idx) => (
            <mesh key={idx} position={[-0.238, y, 0.04]}>
              <boxGeometry args={[0.38, 0.003, 0.001]} />
              <meshBasicMaterial color={INK_DARK} transparent opacity={0.12} />
            </mesh>
          ))}
        </group>

        {/* ── RIGHT COVER ── */}
        <group ref={rightCoverRef} position={[0.028, 0, 0]}>
          <mesh position={[0.26, 0, -0.024]}>
            <boxGeometry args={[0.52, 0.72, 0.038]} />
            <meshStandardMaterial color={LEATHER_MID} roughness={0.72} metalness={0.05} />
          </mesh>
          <mesh position={[0.498, 0, -0.024]}>
            <boxGeometry args={[0.038, 0.73, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          <mesh position={[0.26, 0.355, -0.024]}>
            <boxGeometry args={[0.52, 0.036, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          <mesh position={[0.26, -0.355, -0.024]}>
            <boxGeometry args={[0.52, 0.036, 0.045]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.22} metalness={0.82} />
          </mesh>
          <mesh position={[0.49, 0.345, -0.016]}>
            <boxGeometry args={[0.055, 0.055, 0.052]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.18} metalness={0.9} />
          </mesh>
          <mesh position={[0.49, -0.345, -0.016]}>
            <boxGeometry args={[0.055, 0.055, 0.052]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.18} metalness={0.9} />
          </mesh>
          <mesh position={[0.26, 0.04, -0.004]}>
            <ringGeometry args={[0.08, 0.1, 32]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.3} metalness={0.75} side={THREE.DoubleSide} emissive={GOLD_LIGHT} emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0.26, 0.04, -0.002]}>
            <ringGeometry args={[0.055, 0.065, 4]} />
            <meshStandardMaterial color={GOLD_LIGHT} roughness={0.2} metalness={0.85} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.238, 0, 0.014]}>
            <boxGeometry args={[0.46, 0.65, 0.05]} />
            <meshStandardMaterial color={PARCHMENT_MID} roughness={0.9} />
          </mesh>
          <mesh position={[0.238, 0.325, 0.014]}>
            <boxGeometry args={[0.46, 0.006, 0.05]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0.238, -0.325, 0.014]}>
            <boxGeometry args={[0.46, 0.006, 0.05]} />
            <meshStandardMaterial color={GOLD_MID} roughness={0.5} metalness={0.4} />
          </mesh>
          {[-0.18, -0.08, 0.02, 0.12, 0.22].map((y, idx) => (
            <mesh key={idx} position={[0.238, y, 0.04]}>
              <boxGeometry args={[0.38, 0.003, 0.001]} />
              <meshBasicMaterial color={INK_DARK} transparent opacity={0.12} />
            </mesh>
          ))}
        </group>

        {/* ── Animated Turning Pages ── */}
        <mesh ref={flipPage1Ref} visible={false} position={[0, 0, 0.038]}>
          <boxGeometry args={[0.44, 0.63, 0.006]} />
          <meshStandardMaterial color={PARCHMENT} emissive={GOLD_LIGHT} emissiveIntensity={0.08} roughness={0.9} />
        </mesh>
        <mesh ref={flipPage2Ref} visible={false} position={[0, 0, 0.044]}>
          <boxGeometry args={[0.44, 0.63, 0.006]} />
          <meshStandardMaterial color={PARCHMENT_MID} emissive="#c084fc" emissiveIntensity={0.06} roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
