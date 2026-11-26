import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainHeight } from '../world/terrain';
import { ENEMY_ATTACK_DAMAGE, ENEMY_MAX_HP } from '../gameplay/combat/HealthSystem';

export interface EnemyEntity {
  id: string;
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
  const spawns: Array<[number, number, number]> = [
    [-38, -32, 12],
    [-64, -36, 10],
    [-46, -60, 11],
    [28, -28, 13],
    [42, 26, 14],
    [-26, 44, 12],
    [16, 48, 11],
    [46, -62, 10],
  ];

  return spawns.map(([x, z, radius], idx) => {
    const y = getTerrainHeight(x, z);
    const home = new THREE.Vector3(x, y, z);
    return {
      id: `enemy-${idx}`,
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

function EnemyMesh({ enemy }: { enemy: EnemyEntity }) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const eyeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const hpBarGroupRef = useRef<THREE.Group>(null);
  const hpFillRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock, camera }, delta) => {
    const g = groupRef.current;
    if (!g) return;

    g.visible = enemy.alive;
    if (!enemy.alive) return;

    const bob = Math.sin(clock.getElapsedTime() * (enemy.chasing ? 7 : 3.5) + enemy.home.x) * 0.14;
    g.position.set(enemy.position.x, enemy.position.y + 1.05 + bob, enemy.position.z);
    g.rotation.y = enemy.yaw;

    if (coreRef.current) {
      coreRef.current.rotation.y += delta * (enemy.chasing ? 4.0 : 1.5);
    }

    if (bodyMatRef.current) {
      if (enemy.hitFlash > 0) {
        bodyMatRef.current.color.set('#ffffff');
        bodyMatRef.current.emissive.set('#ff4d4d');
        bodyMatRef.current.emissiveIntensity = 1.4;
      } else {
        bodyMatRef.current.color.set(enemy.chasing ? '#4c1d3d' : '#2d2942');
        bodyMatRef.current.emissive.set(enemy.chasing ? '#7f1d1d' : '#1e1b2e');
        bodyMatRef.current.emissiveIntensity = enemy.chasing ? 0.5 : 0.15;
      }
    }

    if (eyeMatRef.current) {
      eyeMatRef.current.color.set(enemy.chasing ? '#ff3b3b' : '#f59e0b');
      eyeMatRef.current.emissive.set(enemy.chasing ? '#ff1e1e' : '#d97706');
      eyeMatRef.current.emissiveIntensity = enemy.chasing ? 2.4 : 1.4;
    }

    // Overhead HP bar when damaged
    if (hpBarGroupRef.current && hpFillRef.current) {
      const showHp = enemy.hp < enemy.maxHp;
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
      {/* Main golem/stalker body */}
      <mesh castShadow>
        <dodecahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial ref={bodyMatRef} color="#2d2942" roughness={0.6} flatShading />
      </mesh>
      {/* Floating shoulder shards */}
      <mesh castShadow position={[-0.95, 0.25, 0]} rotation={[0.3, 0.2, 0.4]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#3f3a5c" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.95, 0.25, 0]} rotation={[-0.3, -0.2, -0.4]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#3f3a5c" roughness={0.6} />
      </mesh>
      {/* Glowing eye */}
      <mesh ref={coreRef} position={[0, 0.15, 0.72]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial
          ref={eyeMatRef}
          color="#f59e0b"
          emissive="#d97706"
          emissiveIntensity={1.4}
        />
      </mesh>

      {/* Overhead Health Bar */}
      <group ref={hpBarGroupRef} position={[0, 1.35, 0]} visible={false}>
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
          enemy.patrolTarget.set(nx, getTerrainHeight(nx, nz), nz);
        } else {
          tempVec.current.normalize();
          const speed = 2.6;
          enemy.position.x += tempVec.current.x * speed * dt;
          enemy.position.z += tempVec.current.z * speed * dt;
          enemy.yaw = Math.atan2(tempVec.current.x, tempVec.current.z);
        }
      }

      enemy.position.y = getTerrainHeight(enemy.position.x, enemy.position.z);
    }
  });

  return (
    <group>
      {enemiesRef.current.map((enemy) => (
        <EnemyMesh key={enemy.id} enemy={enemy} />
      ))}
    </group>
  );
}
