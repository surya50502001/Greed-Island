import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGroundHeight } from '../../world/terrain';
import { FENRIR_BOSS_CONFIG, BossEncounterState, BossTarget } from '../../domain/bosses/types';
import { stepBossEncounter } from '../../domain/bosses/encounter';
import { RaidEvent } from '../../domain/raids/types';

interface RaidBossActorProps {
  raid: RaidEvent | null;
  bossRef: React.MutableRefObject<BossEncounterState | null>;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  isInvisible: boolean;
  isPlayerDead: boolean;
  onBossAttackHit: (damage: number, abilityName: string) => void;
}

export function RaidBossActor({
  raid,
  bossRef,
  playerPosRef,
  isInvisible,
  isPlayerDead,
  onBossAttackHit,
}: RaidBossActorProps) {
  const { scene, animations } = useGLTF(FENRIR_BOSS_CONFIG.modelUrl);

  const rootRef = useRef<THREE.Group>(null);
  const modelWrapRef = useRef<THREE.Group>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const crestRef = useRef<THREE.Mesh>(null);
  const telegraphGroupRef = useRef<THREE.Group>(null);
  const telegraphFillRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const currentClipRef = useRef<string | null>(null);
  const smoothYawRef = useRef(0);

  const targetsRef = useRef<BossTarget[]>([
    { id: 'local-player', position: { x: 0, y: 0, z: 0 }, isDead: false, isInvisible: false },
  ]);

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
          const cm = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
          mesh.material = cm;
          const arr = Array.isArray(cm) ? cm : [cm];
          arr.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const std = m as THREE.MeshStandardMaterial;
              // Distinguish Alpha Mist Boss visually with deep obsidian-violet tint
              std.color.multiply(new THREE.Color('#a78bfa'));
              mats.push(std);
            }
          });
        }
      }
    });

    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = size.y > 0.01 ? (1.25 * FENRIR_BOSS_CONFIG.scale) / size.y : FENRIR_BOSS_CONFIG.scale;
    const oy = isFinite(box.min.y) ? -box.min.y * s : 0;
    return { cloned: c, normScale: s, offsetY: oy, matList: mats };
  }, [scene]);

  const { actions } = useAnimations(animations, modelWrapRef);

  useEffect(() => {
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
      matList.forEach((m) => m.dispose());
    };
  }, [actions, matList]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const boss = bossRef.current;

    if (beaconRef.current) {
      beaconRef.current.rotation.y = clock.getElapsedTime() * 1.1;
    }

    if (!raid || !boss || !rootRef.current) {
      if (rootRef.current) rootRef.current.visible = false;
      if (telegraphGroupRef.current) telegraphGroupRef.current.visible = false;
      return;
    }

    // Only simulate boss AI once raid encounter is InProgress
    if (raid.status === 'InProgress') {
      const pPos = playerPosRef.current;
      const t0 = targetsRef.current[0];
      t0.position.x = pPos.x;
      t0.position.y = pPos.y;
      t0.position.z = pPos.z;
      t0.isDead = isPlayerDead;
      t0.isInvisible = isInvisible;

      const atkEvent = stepBossEncounter(
        boss,
        FENRIR_BOSS_CONFIG,
        targetsRef.current,
        dt,
        getGroundHeight
      );
      if (atkEvent && atkEvent.hitPlayerIds.includes('local-player')) {
        onBossAttackHit(atkEvent.damage, atkEvent.abilityName);
      }

      raid.bossHp = boss.hp;
      raid.bossPhase = boss.phase;
    }

    rootRef.current.visible = true;
    rootRef.current.position.set(boss.position.x, boss.position.y, boss.position.z);

    let diff = boss.yaw - smoothYawRef.current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    smoothYawRef.current += diff * Math.min(1, 9 * dt);
    rootRef.current.rotation.y = smoothYawRef.current;

    // Animations using verified Wolf.glb clips
    let desiredClip = 'AnimalArmature|Idle';
    let isOneShot = false;
    let timeScale = 1.0;

    if (boss.aiState === 'Defeated') {
      desiredClip = 'AnimalArmature|Death';
      isOneShot = true;
    } else if (boss.aiState === 'Telegraph' || boss.aiState === 'Attack') {
      desiredClip = 'AnimalArmature|Attack';
      isOneShot = true;
      timeScale = boss.aiState === 'Telegraph' ? 0.55 : 1.2;
    } else if (boss.aiState === 'Vulnerable') {
      desiredClip = 'AnimalArmature|Idle_HitReact_Left';
    } else if (boss.aiState === 'Chase') {
      desiredClip = 'AnimalArmature|Gallop';
      timeScale = 1.15;
    }

    if (actions[desiredClip] && currentClipRef.current !== desiredClip) {
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

    // Hit flash, Arcane Shield, & Exposed Weak Point Crest
    for (const mat of matList) {
      if (boss.hitFlash > 0) {
        mat.emissive.set('#f43f5e');
        mat.emissiveIntensity = 1.3;
      } else if (boss.weakPointExposed) {
        mat.emissive.set('#f59e0b');
        mat.emissiveIntensity = 0.45;
      } else {
        mat.emissive.set('#3b0764');
        mat.emissiveIntensity = boss.phase >= 2 ? 0.35 : 0.15;
      }
    }

    if (shieldRef.current) {
      shieldRef.current.visible = boss.shieldHp > 0;
    }
    if (crestRef.current) {
      crestRef.current.visible = boss.weakPointExposed || boss.phase >= 2;
      crestRef.current.rotation.y = clock.getElapsedTime() * 2.5;
    }

    // 3D Ground Attack Telegraph
    if (telegraphGroupRef.current && telegraphFillRef.current) {
      const showTele = boss.aiState === 'Telegraph';
      telegraphGroupRef.current.visible = showTele;
      if (showTele) {
        const ty = getGroundHeight(boss.telegraphCenter.x, boss.telegraphCenter.z) + 0.12;
        telegraphGroupRef.current.position.set(boss.telegraphCenter.x, ty, boss.telegraphCenter.z);
        telegraphGroupRef.current.scale.setScalar(boss.telegraphRadius);
        const fillPct = Math.max(
          0.08,
          1 - boss.telegraphTimer / Math.max(0.1, boss.telegraphDuration)
        );
        telegraphFillRef.current.scale.setScalar(fillPct);
      }
    }
  });

  if (!raid || raid.status === 'Expired' || raid.status === 'Failed') {
    return null;
  }

  const beaconY = getGroundHeight(raid.location.x, raid.location.z);

  return (
    <group>
      {/* Raid Zone Marker & Preparation Boundary */}
      <group position={[raid.location.x, beaconY + 0.12, raid.location.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[15.4, 16.0, 48]} />
          <meshBasicMaterial
            color={raid.status === 'InProgress' ? '#f59e0b' : '#a855f7'}
            transparent
            opacity={0.48}
            side={THREE.DoubleSide}
          />
        </mesh>
        {(raid.status === 'Upcoming' || raid.status === 'Gathering') && (
          <>
            <mesh position={[0, 12, 0]}>
              <cylinderGeometry args={[0.16, 0.45, 24, 12, 1, true]} />
              <meshBasicMaterial
                color="#c084fc"
                transparent
                opacity={0.28}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh ref={beaconRef} position={[0, 3.6, 0]}>
              <octahedronGeometry args={[0.75, 0]} />
              <meshStandardMaterial
                color="#e9d5ff"
                emissive="#a855f7"
                emissiveIntensity={2.0}
              />
            </mesh>
          </>
        )}
      </group>

      {/* Dungeon Boss Model + Weak Point + Shield */}
      <group ref={rootRef} visible={false}>
        <group ref={modelWrapRef} position={[0, offsetY, 0]} scale={normScale}>
          <primitive object={cloned} />
        </group>

        {/* Exposed Weak Point Crystal */}
        <mesh ref={crestRef} position={[0, 2.7, 0.2]} visible={false}>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={2.2}
          />
        </mesh>

        {/* Phase 3 Temporary Arcane Shield */}
        <mesh ref={shieldRef} position={[0, 1.6, 0]} visible={false}>
          <sphereGeometry args={[2.9, 24, 18]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.22}
            wireframe
          />
        </mesh>
      </group>

      {/* Boss Attack Telegraph Ring */}
      <group ref={telegraphGroupRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.92, 1.0, 40]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={telegraphFillRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.92, 40]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.32} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
