import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGroundHeight, getTerrainHeight } from '../world/terrain';
import { ENEMY_ATTACK_DAMAGE, ENEMY_MAX_HP } from '../gameplay/combat/HealthSystem';

export interface EnemyEntity {
  id: string;
  species: 'wolf' | 'spider';
  home: THREE.Vector3;
  position: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  patrolRadius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer: number;
  chasing: boolean;
  hitFlash: number;
  yaw: number;
  attackCooldown: number;
  knockbackX: number;
  knockbackZ: number;
}

export function createInitialEnemies(): EnemyEntity[] {
  const spawns: Array<[number, number, number, 'wolf' | 'spider']> = [
    [-38, -32, 12, 'spider'],
    [-64, -36, 10, 'wolf'],
    [-46, -60, 11, 'spider'],
    [28, -28, 13, 'wolf'],
    [42, 26, 14, 'wolf'],
    [-26, 44, 12, 'wolf'],
    [16, 48, 11, 'spider'],
    [46, -62, 10, 'spider'],
  ];

  return spawns.map(([x, z, radius, species], idx) => {
    const y = getTerrainHeight(x, z);
    const home = new THREE.Vector3(x, y, z);
    return {
      id: `enemy-${idx}`,
      species,
      home: home.clone(),
      position: home.clone(),
      patrolTarget: new THREE.Vector3(x + radius * 0.6, y, z + radius * 0.4),
      patrolRadius: radius,
      hp: ENEMY_MAX_HP,
      maxHp: ENEMY_MAX_HP,
      alive: true,
      respawnTimer: 0,
      chasing: false,
      hitFlash: 0,
      yaw: 0,
      attackCooldown: 0,
      knockbackX: 0,
      knockbackZ: 0,
    };
  });
}

interface EnemiesProps {
  enemiesRef: React.MutableRefObject<EnemyEntity[]>;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  isInvisible: boolean;
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

    // Smooth yaw turning
    let diff = enemy.yaw - smoothYawRef.current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    smoothYawRef.current += diff * Math.min(1, 10 * dt);
    g.rotation.y = smoothYawRef.current;

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
  isPlayerDead,
  onPlayerHit,
}: EnemiesProps) {
  const tempVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const playerPos = playerPosRef.current;

    for (const enemy of enemiesRef.current) {
      if (!enemy.alive) {
        enemy.respawnTimer -= dt;
        if (enemy.respawnTimer <= 0) {
          enemy.alive = true;
          enemy.hp = enemy.maxHp;
          enemy.chasing = false;
          enemy.hitFlash = 0;
          enemy.knockbackX = 0;
          enemy.knockbackZ = 0;
          enemy.position.copy(enemy.home);
        }
        continue;
      }

      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      }

      // Apply & decay knockback impulse
      if (Math.abs(enemy.knockbackX) > 0.05 || Math.abs(enemy.knockbackZ) > 0.05) {
        enemy.position.x += enemy.knockbackX * dt;
        enemy.position.z += enemy.knockbackZ * dt;
        const decay = Math.exp(-10 * dt);
        enemy.knockbackX *= decay;
        enemy.knockbackZ *= decay;
      }

      const distToPlayer = Math.hypot(
        playerPos.x - enemy.position.x,
        playerPos.z - enemy.position.z
      );
      const verticalDiff = Math.abs(playerPos.y - enemy.position.y);

      const aggroRange = 17;
      if (!isPlayerDead && !isInvisible && distToPlayer < aggroRange && verticalDiff < 8.5) {
        enemy.chasing = true;
      } else {
        enemy.chasing = false;
      }

      const target = enemy.chasing ? playerPos : enemy.patrolTarget;
      tempVec.current.set(target.x - enemy.position.x, 0, target.z - enemy.position.z);
      const distToTarget = tempVec.current.length();

      if (enemy.attackCooldown > 0) {
        enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      }

      if (enemy.chasing) {
        if (distToTarget > 1.85) {
          tempVec.current.normalize();
          const speed = 5.4;
          enemy.position.x += tempVec.current.x * speed * dt;
          enemy.position.z += tempVec.current.z * speed * dt;
          enemy.yaw = Math.atan2(tempVec.current.x, tempVec.current.z);
        } else if (enemy.attackCooldown <= 0 && !isPlayerDead) {
          enemy.attackCooldown = 1.4;
          onPlayerHit?.(ENEMY_ATTACK_DAMAGE, enemy.id);
        }
      } else {
        if (distToTarget < 1.2) {
          const angle = Math.random() * Math.PI * 2;
          const r = 4 + Math.random() * enemy.patrolRadius;
          const nx = enemy.home.x + Math.cos(angle) * r;
          const nz = enemy.home.z + Math.sin(angle) * r;
          enemy.patrolTarget.set(nx, getGroundHeight(nx, nz), nz);
        } else {
          tempVec.current.normalize();
          const speed = 2.6;
          enemy.position.x += tempVec.current.x * speed * dt;
          enemy.position.z += tempVec.current.z * speed * dt;
          enemy.yaw = Math.atan2(tempVec.current.x, tempVec.current.z);
        }
      }

      enemy.position.y = getGroundHeight(enemy.position.x, enemy.position.z);
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
