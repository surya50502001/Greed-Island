import { useMemo, useRef, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CardDefinition, CardId } from '../types/game';

interface GrimoireCardProps {
  card: CardDefinition;
  isActive: boolean;
  emergeProgress: React.MutableRefObject<number>;
  activatingCard: CardId | null;
  activateProgress: React.MutableRefObject<number>;
  basePos: [number, number, number];
  baseRotZ: number;
  onSelect: (id: CardId) => void;
}

function drawCardArtwork(
  ctx: CanvasRenderingContext2D,
  id: CardId,
  cx: number,
  cy: number,
  accent: string,
  glow: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Arcane halo behind artwork
  const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, 74);
  grad.addColorStop(0, `${accent}66`);
  grad.addColorStop(0.6, `${glow}22`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = glow;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();

  if (id === 'flight') {
    // Stylized twin wings + wind swirl
    ctx.fillStyle = glow;
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      ctx.beginPath();
      ctx.moveTo(6, 12);
      ctx.quadraticCurveTo(38, -28, 52, -16);
      ctx.quadraticCurveTo(36, 0, 44, 12);
      ctx.quadraticCurveTo(22, 14, 10, 22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(0, -28);
    ctx.moveTo(-10, -16);
    ctx.lineTo(0, -28);
    ctx.lineTo(10, -16);
    ctx.stroke();
  } else if (id === 'weapon') {
    // Glowing energy sword
    ctx.save();
    ctx.rotate(-Math.PI / 5);
    // Blade
    ctx.fillStyle = '#a5f3fc';
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(8, -32);
    ctx.lineTo(6, 16);
    ctx.lineTo(-6, 16);
    ctx.lineTo(-8, -32);
    ctx.closePath();
    ctx.fill();
    // Crossguard
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-20, 14, 40, 7);
    // Hilt
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-4, 21, 8, 18);
    ctx.restore();
  } else {
    // Phantom Veil: spectral eye & crescent
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.quadraticCurveTo(0, -32, 42, 0);
    ctx.quadraticCurveTo(0, 32, -42, 0);
    ctx.stroke();

    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -4, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function createCardTexture(card: CardDefinition, isActive: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 460;
  const ctx = canvas.getContext('2d')!;

  // Card background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 460);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.55, '#1e1b4b');
  bg.addColorStop(1, '#090d1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 460);

  // Ornate inner border
  ctx.strokeStyle = card.accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 300, 440);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, 284, 424);

  // Rarity & category header
  ctx.fillStyle = card.glowColor;
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(card.category, 28, 46);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(card.rarity.toUpperCase(), 292, 46);

  // Artwork frame
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(30, 64, 260, 186);
  ctx.strokeStyle = `${card.accentColor}88`;
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 64, 260, 186);

  drawCardArtwork(ctx, card.id, 160, 157, card.accentColor, card.glowColor);

  // Card Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(card.name, 160, 294);

  // Divider
  ctx.strokeStyle = card.accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 310);
  ctx.lineTo(256, 310);
  ctx.stroke();

  // Description (word-wrapped)
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '18px Inter, sans-serif';
  const words = card.description.split(' ');
  let line = '';
  let y = 344;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 248) {
      ctx.fillText(line, 160, y);
      line = w;
      y += 26;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 160, y);

  // Active status pill
  if (isActive) {
    ctx.fillStyle = card.accentColor;
    ctx.fillRect(88, 404, 144, 28);
    ctx.fillStyle = '#090d1a';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText('ACTIVE', 160, 423);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('CLICK TO CAST', 160, 422);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function GrimoireCard({
  card,
  isActive,
  emergeProgress,
  activatingCard,
  activateProgress,
  basePos,
  baseRotZ,
  onSelect,
}: GrimoireCardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const borderMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const frontMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const texture = useMemo(() => createCardTexture(card, isActive), [card, isActive]);

  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const p = emergeProgress.current;
    const t = clock.getElapsedTime();

    // Smoothly emerge from the book center (0, 0.1, 0) to arc position
    const targetX = basePos[0] * p;
    const hoverLift = hovered ? 0.14 : 0;
    const hoverForward = hovered ? 0.16 : 0;
    const floatBob = p > 0.8 ? Math.sin(t * 2.4 + basePos[0] * 2) * 0.025 : 0;

    let targetY = THREE.MathUtils.lerp(0.05, basePos[1], p) + hoverLift + floatBob;
    let targetZ = THREE.MathUtils.lerp(0.0, basePos[2], p) + hoverForward;
    let targetScale = THREE.MathUtils.lerp(0.15, hovered ? 1.13 : 1.0, p);
    let opacity = Math.min(1, p * 1.4);

    // Selection animation: selected card surges up & dissolves; others tuck back
    if (activatingCard) {
      const ap = activateProgress.current;
      if (activatingCard === card.id) {
        targetY += ap * 0.45;
        targetZ += ap * 0.25;
        targetScale *= 1 + ap * 0.22;
        opacity = Math.max(0, 1 - ap * 1.15);
      } else {
        targetY = THREE.MathUtils.lerp(targetY, 0.05, ap);
        targetScale *= Math.max(0.1, 1 - ap * 0.85);
        opacity = Math.max(0, 1 - ap * 1.3);
      }
    }

    const lerpAmt = 1 - Math.exp(-14 * Math.min(delta, 0.05));
    g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, lerpAmt);
    g.position.y = THREE.MathUtils.lerp(g.position.y, targetY, lerpAmt);
    g.position.z = THREE.MathUtils.lerp(g.position.z, targetZ, lerpAmt);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, baseRotZ * p, lerpAmt);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, hovered ? 0 : -baseRotZ * 0.45 * p, lerpAmt);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, targetScale, lerpAmt));

    if (borderMatRef.current) {
      borderMatRef.current.emissiveIntensity = hovered ? 2.2 : isActive ? 1.5 : 0.7;
      borderMatRef.current.opacity = opacity;
    }
    if (frontMatRef.current) {
      frontMatRef.current.opacity = opacity;
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (emergeProgress.current > 0.6 && !activatingCard) {
      setHovered(true);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (emergeProgress.current > 0.6 && !activatingCard) {
      setHovered(false);
      document.body.style.cursor = 'auto';
      onSelect(card.id);
    }
  };

  return (
    <group
      ref={groupRef}
      position={[0, 0.05, 0]}
      scale={0.15}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {/* Glowing card frame */}
      <mesh>
        <boxGeometry args={[0.66, 0.94, 0.024]} />
        <meshStandardMaterial
          ref={borderMatRef}
          color={card.accentColor}
          emissive={card.accentColor}
          emissiveIntensity={0.8}
          transparent
          opacity={1}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>

      {/* Card Artwork & Info Face */}
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[0.62, 0.89]} />
        <meshStandardMaterial
          ref={frontMatRef}
          map={texture}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={0.35}
          transparent
          opacity={1}
          roughness={0.35}
        />
      </mesh>
    </group>
  );
}
