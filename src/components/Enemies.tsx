import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGroundHeight, getTerrainHeight } from '../world/terrain';
import { createInitialEnemyStates, stepEnemyAI } from '../domain/enemies/ai';
import { EnemyDomainState, EnemyTarget } from '../domain/enemies/types';

export type EnemyEntity = EnemyDomainState;

export function createInitialEnemies(): EnemyEntity[] {
  return createInitialEnemyStates(getTerrainHeight);
}

interface EnemiesProps {
  enemiesRef: React.MutableRefObject<EnemyEntity[]>;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  isInvisible: boolean;
  isFlying?: boolean;
  isPlayerDead: boolean;
  onPlayerHit?: (damage: number, enemyId: string) => void;
}

function EnemyCreature({ enemy }: { enemy: EnemyEntity }) {
  const url =
    enemy.species === 'wolf' ? '/models/enemies/Wolf.glb' : '/models/enemies/Spider.glb';
  const { scene, animations } = useGLTF(url);

  const groupRef = useRef<THREE.Group>(null);
  const modelWrapRef = useRef<THREE.Group>(null);
  const hpBarGroupRef = useRef<THREE.Group>(null);
  const hpFillRef = useRef<THREE.Mesh>(null);

  const currentClipRef = useRef<string | null>(null);
  const attackAnimTimerRef = useRef(0);
  const hitAnimTimerRef = useRef(0);
  const deathTimerRef = useRef(0);
  const prevAttackCooldownRef = useRef(0);
  const prevHpRef = useRef(enemy.maxHp);
  const prevAliveRef = useRef(true);
  const smoothYawRef = useRef(enemy.yaw);

  const { cloned, normScale, offsetY, matList } = useMemo(() => {
    const c = cloneSkinned(scene);
    c.updateMatrixWorld(true);
    const mats: THREE.MeshStandardMaterial[] = [];
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const clonedMat = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
          mesh.material = clonedMat;
          const arr = Array.isArray(clonedMat) ? clonedMat : [clonedMat];
          arr.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              mats.push(m as THREE.MeshStandardMaterial);
            }
          });
        }
      }
    });

    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetH = enemy.species === 'wolf' ? 1.25 : 1.1;
    const s = size.y > 0.01 ? targetH / size.y : 1;
    const oy = isFinite(box.min.y) ? -box.min.y * s : 0;

    return { cloned: c, normScale: s, offsetY: oy, matList: mats };
  }, [scene, enemy.species]);

  const { actions } = useAnimations(animations, modelWrapRef);

  useEffect(() => {
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
      matList.forEach((m) => m.dispose());
    };
  }, [actions, matList]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = groupRef.current;
    if (!g) return;

    // Detect state transitions for one-shot animations
    if (enemy.attackCooldown > prevAttackCooldownRef.current + 0.3) {
      attackAnimTimerRef.current = 0.55;
    }
    prevAttackCooldownRef.current = enemy.attackCooldown;

    if (enemy.hp < prevHpRef.current && enemy.alive) {
      hitAnimTimerRef.current = 0.35;
    }
    prevHpRef.current = enemy.hp;

    if (!enemy.alive && prevAliveRef.current) {
      deathTimerRef.current = 1.3;
    }
    if (enemy.alive && !prevAliveRef.current) {
      deathTimerRef.current = 0;
    }
    prevAliveRef.current = enemy.alive;

    if (attackAnimTimerRef.current > 0) attackAnimTimerRef.current -= dt;
    if (hitAnimTimerRef.current > 0) hitAnimTimerRef.current -= dt;
    if (!enemy.alive && deathTimerRef.current > 0) deathTimerRef.current -= dt;

    g.visible = enemy.alive || deathTimerRef.current > 0;
    if (!g.visible) return;

    g.position.set(enemy.position.x, enemy.position.y, enemy.position.z);

    // Smooth yaw turning + hit recoil on creatures without a dedicated hit-react clip (e.g. Spider)
    let diff = enemy.yaw - smoothYawRef.current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    smoothYawRef.current += diff * Math.min(1, 10 * dt);
    g.rotation.y = smoothYawRef.current;
    if (modelWrapRef.current) {
      const recoil =
        enemy.species === 'spider' && hitAnimTimerRef.current > 0
          ? -0.34 * Math.sin((hitAnimTimerRef.current / 0.35) * Math.PI)
          : 0;
      modelWrapRef.current.rotation.x = THREE.MathUtils.lerp(
        modelWrapRef.current.rotation.x,
        recoil,
        1 - Math.exp(-16 * dt)
      );
    }

    // Choose clip based on species & state
    let desiredClip = '';
    let isOneShot = false;
    let timeScale = 1.0;

    if (enemy.species === 'wolf') {
      if (!enemy.alive) {
        desiredClip = 'AnimalArmature|Death';
        isOneShot = true;
      } else if (hitAnimTimerRef.current > 0) {
        desiredClip = 'AnimalArmature|Idle_HitReact_Left';
        isOneShot = true;
      } else if (attackAnimTimerRef.current > 0) {
        desiredClip = 'AnimalArmature|Attack';
        isOneShot = true;
      } else if (enemy.chasing) {
        desiredClip = 'AnimalArmature|Gallop';
        timeScale = 1.25;
      } else {
        desiredClip = 'AnimalArmature|Walk';
        timeScale = 1.0;
      }
    } else {
      if (!enemy.alive) {
        desiredClip = 'SpiderArmature|Spider_Death';
        isOneShot = true;
      } else if (attackAnimTimerRef.current > 0) {
        desiredClip = 'SpiderArmature|Spider_Attack';
        isOneShot = true;
      } else if (enemy.chasing) {
        desiredClip = 'SpiderArmature|Spider_Walk';
        timeScale = 1.7;
      } else {
        desiredClip = 'SpiderArmature|Spider_Walk';
        timeScale = 0.95;
      }
    }

    if (desiredClip && actions[desiredClip] && currentClipRef.current !== desiredClip) {
      const prev = currentClipRef.current ? actions[currentClipRef.current] : null;
      const next = actions[desiredClip]!;
      if (prev && prev !== next) prev.fadeOut(0.16);
      next.reset();
      next.enabled = true;
      if (isOneShot) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
      }
      next.fadeIn(0.16).play();
      currentClipRef.current = desiredClip;
    }

    if (currentClipRef.current && actions[currentClipRef.current]) {
      actions[currentClipRef.current]!.timeScale = timeScale;
    }

    // Hit flash tint
    for (const mat of matList) {
      if (enemy.hitFlash > 0) {
        mat.emissive.set('#ef4444');
        mat.emissiveIntensity = 1.2;
      } else {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    }

    // Overhead HP bar when damaged
    if (hpBarGroupRef.current && hpFillRef.current) {
      const showHp = enemy.alive && enemy.hp < enemy.maxHp;
      hpBarGroupRef.current.visible = showHp;
      if (showHp) {
        hpBarGroupRef.current.lookAt(camera.position);
        const pct = Math.max(0.01, enemy.hp / enemy.maxHp);
        hpFillRef.current.scale.x = pct;
        hpFillRef.current.position.x = -(1 - pct) * 0.6;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={modelWrapRef} position={[0, offsetY, 0]} scale={normScale}>
        <primitive object={cloned} />
      </group>

      {/* Overhead Health Bar */}
      <group ref={hpBarGroupRef} position={[0, 1.65, 0]} visible={false}>
        <mesh>
          <planeGeometry args={[1.26, 0.16]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={hpFillRef} position={[0, 0, 0.01]}>
          <planeGeometry args={[1.2, 0.1]} />
          <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

export function Enemies({
  enemiesRef,
  playerPosRef,
  isInvisible,
  isFlying = false,
  isPlayerDead,
  onPlayerHit,
}: EnemiesProps) {
  const targetRef = useRef<EnemyTarget[]>([
    {
      id: 'local-player',
      position: { x: 0, y: 0, z: 0 },
      isDead: false,
      isInvisible: false,
    },
  ]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const playerPos = playerPosRef.current;
    const t0 = targetRef.current[0];
    t0.position.x = playerPos.x;
    t0.position.y = playerPos.y;
    t0.position.z = playerPos.z;
    t0.isDead = isPlayerDead;
    t0.isInvisible = isInvisible;
    t0.isFlying = isFlying;

    for (const enemy of enemiesRef.current) {
      const hitEvent = stepEnemyAI(enemy, targetRef.current, dt, getGroundHeight);
      if (hitEvent) {
        onPlayerHit?.(hitEvent.damage, hitEvent.enemyId);
      }
    }
  });

  return (
    <group>
      {enemiesRef.current.map((enemy) => (
        <EnemyCreature key={enemy.id} enemy={enemy} />
      ))}
    </group>
  );
}

useGLTF.preload('/models/enemies/Wolf.glb');
useGLTF.preload('/models/enemies/Spider.glb');
