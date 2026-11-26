import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND_RADIUS } from '../types/game';
import { getTerrainHeight } from '../world/terrain';
import { EnemyEntity } from './Enemies';

interface PlayerProps {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  enemiesRef: React.MutableRefObject<EnemyEntity[]>;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  onPointerLockChange: (locked: boolean) => void;
}

export function Player({
  playerPosRef,
  enemiesRef,
  isFlying,
  hasWeapon,
  isInvisible,
  onPointerLockChange,
}: PlayerProps) {
  const { camera, gl } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const bodyMeshRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const slashTrailRef = useRef<THREE.Mesh>(null);
  const auraGroupRef = useRef<THREE.Group>(null);

  // Physics & input state in refs for 60fps zero-re-render loop
  const velocityRef = useRef(new THREE.Vector3());
  const groundedRef = useRef(true);
  const playerYawRef = useRef(0);
  const camYawRef = useRef(Math.PI); // Start facing north (-Z) toward island center
  const camPitchRef = useRef(0.28);
  const isDraggingRef = useRef(false);

  const keysRef = useRef<Record<string, boolean>>({});
  const attackTimerRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const attackHitDoneRef = useRef(false);

  // Reusable vectors
  const camTargetRef = useRef(new THREE.Vector3());
  const camPosRef = useRef(new THREE.Vector3());
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const moveDirRef = useRef(new THREE.Vector3());

  // Apply transparency to all player meshes when invisible
  useEffect(() => {
    const group = bodyMeshRef.current;
    if (!group) return;
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat || !('opacity' in mat)) return;
        mat.transparent = isInvisible;
        mat.opacity = isInvisible ? 0.25 : 1.0;
        mat.depthWrite = !isInvisible;
        mat.needsUpdate = true;
      }
    });
  }, [isInvisible]);

  // Keyboard & mouse controls
  useEffect(() => {
    const dom = gl.domElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const locked = document.pointerLockElement === dom;
      if (locked || isDraggingRef.current) {
        camYawRef.current -= e.movementX * 0.0032;
        camPitchRef.current = Math.max(
          -0.65,
          Math.min(1.05, camPitchRef.current + e.movementY * 0.0028)
        );
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (document.pointerLockElement !== dom) {
          dom.requestPointerLock?.();
          isDraggingRef.current = true;
        }
        // Trigger melee attack if weapon is summoned
        if (hasWeapon && attackCooldownRef.current <= 0) {
          attackTimerRef.current = 0.28;
          attackCooldownRef.current = 0.36;
          attackHitDoneRef.current = false;
        }
      } else if (e.button === 2) {
        isDraggingRef.current = true;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handlePointerLock = () => {
      onPointerLockChange(document.pointerLockElement === dom);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    dom.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('pointerlockchange', handlePointerLock);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dom.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('pointerlockchange', handlePointerLock);
    };
  }, [gl, hasWeapon, onPointerLockChange]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;
    const pos = playerPosRef.current;
    const vel = velocityRef.current;

    const w = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
    const s = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;
    const a = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
    const d = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;
    const shift = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
    const space = Boolean(keys['Space']);
    const crouch = Boolean(keys['KeyC']);

    const forwardInput = w - s;
    const strafeInput = d - a;

    // Camera horizontal basis
    const yaw = camYawRef.current;
    const pitch = camPitchRef.current;

    if (isFlying) {
      // 3D camera-directed flight
      const cosPitch = Math.cos(pitch);
      forwardRef.current
        .set(-Math.sin(yaw) * cosPitch, -Math.sin(pitch), -Math.cos(yaw) * cosPitch)
        .normalize();
      rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      moveDirRef.current.set(0, 0, 0);
      moveDirRef.current.addScaledVector(forwardRef.current, forwardInput);
      moveDirRef.current.addScaledVector(rightRef.current, strafeInput);
      if (space) moveDirRef.current.y += 1;
      if (crouch) moveDirRef.current.y -= 1;

      if (moveDirRef.current.lengthSq() > 0) {
        moveDirRef.current.normalize();
      }

      const flySpeed = shift ? 28 : 14;
      vel.lerp(moveDirRef.current.multiplyScalar(flySpeed), 1 - Math.exp(-8 * dt));
      pos.addScaledVector(vel, dt);

      // Keep above terrain & below sky ceiling
      const floorY = getTerrainHeight(pos.x, pos.z) + 0.4;
      if (pos.y < floorY) {
        pos.y = floorY;
        if (vel.y < 0) vel.y = 0;
      }
      if (pos.y > 95) pos.y = 95;
      groundedRef.current = false;
    } else {
      // Ground movement
      forwardRef.current.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      moveDirRef.current.set(0, 0, 0);
      moveDirRef.current.addScaledVector(forwardRef.current, forwardInput);
      moveDirRef.current.addScaledVector(rightRef.current, strafeInput);
      if (moveDirRef.current.lengthSq() > 0) {
        moveDirRef.current.normalize();
      }

      const groundSpeed = shift ? 13.0 : 7.4;
      const targetVx = moveDirRef.current.x * groundSpeed;
      const targetVz = moveDirRef.current.z * groundSpeed;
      const accel = groundedRef.current ? 14 : 6;
      vel.x = THREE.MathUtils.lerp(vel.x, targetVx, 1 - Math.exp(-accel * dt));
      vel.z = THREE.MathUtils.lerp(vel.z, targetVz, 1 - Math.exp(-accel * dt));

      if (space && groundedRef.current) {
        vel.y = 11.2;
        groundedRef.current = false;
      }

      vel.y -= 28 * dt;
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      pos.y += vel.y * dt;

      const groundY = getTerrainHeight(pos.x, pos.z);
      if (pos.y <= groundY) {
        pos.y = groundY;
        vel.y = 0;
        groundedRef.current = true;
      } else if (pos.y - groundY > 0.25) {
        groundedRef.current = false;
      }
    }

    // Clamp to island boundary
    const distFromCenter = Math.hypot(pos.x, pos.z);
    const maxR = ISLAND_RADIUS - 5;
    if (distFromCenter > maxR) {
      const ratio = maxR / distFromCenter;
      pos.x *= ratio;
      pos.z *= ratio;
    }

    // Face movement direction smoothly
    const horizSpeed = Math.hypot(vel.x, vel.z);
    if (horizSpeed > 0.4) {
      const targetYaw = Math.atan2(vel.x, vel.z);
      let diff = targetYaw - playerYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      playerYawRef.current += diff * Math.min(1, 12 * dt);
    }

    // Update character transform
    if (groupRef.current) {
      groupRef.current.position.copy(pos);
      groupRef.current.rotation.y = playerYawRef.current;
    }

    // Limb & flight animations
    const t = clock.getElapsedTime();
    const walkCycle = horizSpeed > 0.5 && groundedRef.current && !isFlying ? t * (shift ? 13 : 9) : 0;
    const swing = Math.sin(walkCycle) * 0.65;

    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = isFlying ? 0.25 : swing;
      rightLegRef.current.rotation.x = isFlying ? 0.35 : -swing;
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = isFlying ? -0.5 : -swing * 0.8;
    }

    // Weapon slash & hit detection
    if (attackCooldownRef.current > 0) {
      attackCooldownRef.current = Math.max(0, attackCooldownRef.current - dt);
    }
    if (attackTimerRef.current > 0) {
      attackTimerRef.current = Math.max(0, attackTimerRef.current - dt);
      const progress = 1 - attackTimerRef.current / 0.28;

      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -1.6 + progress * 2.5;
        rightArmRef.current.rotation.y = -0.8 + progress * 1.6;
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = true;
        slashTrailRef.current.rotation.z = -1.1 + progress * 2.2;
      }

      // Hit check mid-swing
      if (!attackHitDoneRef.current && progress >= 0.25) {
        attackHitDoneRef.current = true;
        const pFwdX = Math.sin(playerYawRef.current);
        const pFwdZ = Math.cos(playerYawRef.current);

        for (const enemy of enemiesRef.current) {
          if (!enemy.alive) continue;
          const dx = enemy.position.x - pos.x;
          const dy = enemy.position.y - pos.y;
          const dz = enemy.position.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 4.5 && Math.abs(dy) < 3.5) {
            const dot = (dx * pFwdX + dz * pFwdZ) / (dist || 1);
            if (dist < 2.2 || dot > 0.15) {
              enemy.hitFlash = 0.18;
              enemy.alive = false;
              enemy.chasing = false;
              enemy.respawnTimer = 14;
            }
          }
        }
      }
    } else {
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = hasWeapon ? -0.35 : isFlying ? -0.5 : swing * 0.8;
        rightArmRef.current.rotation.y = 0;
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = false;
      }
    }

    // Flight aura animation
    if (auraGroupRef.current) {
      auraGroupRef.current.visible = isFlying;
      if (isFlying) {
        auraGroupRef.current.rotation.y = t * 3.2;
        auraGroupRef.current.rotation.z = Math.sin(t * 2) * 0.15;
      }
    }

    // Third-person camera orbit follow
    const camDist = isFlying && shift ? 9.5 : 8.0;
    const lookAtY = pos.y + 1.55;
    camTargetRef.current.set(pos.x, lookAtY, pos.z);

    const horizDist = camDist * Math.cos(pitch);
    const camX = pos.x + Math.sin(yaw) * horizDist;
    const camZ = pos.z + Math.cos(yaw) * horizDist;
    let camY = lookAtY + camDist * Math.sin(pitch);

    const terrainUnderCam = getTerrainHeight(camX, camZ) + 0.8;
    if (camY < terrainUnderCam) camY = terrainUnderCam;

    camPosRef.current.set(camX, camY, camZ);
    camera.position.lerp(camPosRef.current, 1 - Math.exp(-16 * dt));
    camera.lookAt(camTargetRef.current);
  });

  return (
    <group ref={groupRef} position={[0, getTerrainHeight(0, 0), 0]}>
      <group ref={bodyMeshRef}>
        {/* Torso */}
        <mesh castShadow position={[0, 1.15, 0]}>
          <boxGeometry args={[0.68, 0.82, 0.42]} />
          <meshStandardMaterial color="#2b59c3" roughness={0.6} />
        </mesh>

        {/* Cape / Scarf */}
        <mesh castShadow position={[0, 1.12, -0.26]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[0.58, 0.78, 0.08]} />
          <meshStandardMaterial color="#e04f5f" roughness={0.7} />
        </mesh>

        {/* Head */}
        <mesh castShadow position={[0, 1.85, 0]}>
          <boxGeometry args={[0.52, 0.52, 0.52]} />
          <meshStandardMaterial color="#f2cfb6" roughness={0.65} />
        </mesh>
        {/* Hair / Hood */}
        <mesh castShadow position={[0, 2.02, -0.04]}>
          <boxGeometry args={[0.56, 0.28, 0.56]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
        {/* Visor / Eyes */}
        <mesh position={[0, 1.86, 0.26]}>
          <boxGeometry args={[0.36, 0.1, 0.04]} />
          <meshStandardMaterial
            color={isInvisible ? '#a5f3fc' : '#38bdf8'}
            emissive="#38bdf8"
            emissiveIntensity={0.8}
          />
        </mesh>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.48, 1.45, 0]}>
          <mesh castShadow position={[0, -0.32, 0]}>
            <boxGeometry args={[0.22, 0.68, 0.22]} />
            <meshStandardMaterial color="#254ca6" roughness={0.65} />
          </mesh>
        </group>

        {/* Right Arm + Summoned Sword */}
        <group ref={rightArmRef} position={[0.48, 1.45, 0]}>
          <mesh castShadow position={[0, -0.32, 0]}>
            <boxGeometry args={[0.22, 0.68, 0.22]} />
            <meshStandardMaterial color="#254ca6" roughness={0.65} />
          </mesh>

          {hasWeapon && (
            <group position={[0, -0.62, 0.28]} rotation={[Math.PI / 2.3, 0, 0]}>
              {/* Hilt */}
              <mesh>
                <cylinderGeometry args={[0.045, 0.045, 0.32, 8]} />
                <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
              </mesh>
              {/* Crossguard */}
              <mesh position={[0, 0.16, 0]}>
                <boxGeometry args={[0.32, 0.07, 0.1]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
              </mesh>
              {/* Glowing Energy Blade */}
              <mesh position={[0, 0.85, 0]}>
                <boxGeometry args={[0.1, 1.32, 0.035]} />
                <meshStandardMaterial
                  color="#67e8f9"
                  emissive="#06b6d4"
                  emissiveIntensity={2.0}
                  roughness={0.1}
                />
              </mesh>
            </group>
          )}
        </group>

        {/* Legs */}
        <mesh ref={leftLegRef} castShadow position={[-0.18, 0.4, 0]}>
          <boxGeometry args={[0.24, 0.72, 0.26]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
        <mesh ref={rightLegRef} castShadow position={[0.18, 0.4, 0]}>
          <boxGeometry args={[0.24, 0.72, 0.26]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
      </group>

      {/* Melee Swing Trail */}
      <mesh
        ref={slashTrailRef}
        visible={false}
        position={[0, 1.25, 0.55]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.15, 2.25, 24, 1, -Math.PI * 0.45, Math.PI * 0.9]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.78} side={THREE.DoubleSide} />
      </mesh>

      {/* Flight Wind / Aura Effect */}
      <group ref={auraGroupRef} visible={false} position={[0, 1.1, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.15, 0.04, 8, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
        </mesh>
        <mesh rotation={[Math.PI / 3, 0.4, 0]}>
          <torusGeometry args={[1.38, 0.03, 8, 32]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.55} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.1, 16, 16]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
