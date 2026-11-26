import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ISLAND_RADIUS } from '../types/game';
import { getTerrainHeight } from '../world/terrain';
import { EnemyEntity } from './Enemies';

const SOLDIER_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';

interface PlayerProps {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  enemiesRef: React.MutableRefObject<EnemyEntity[]>;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  isGrimoireOpen: boolean;
  onPointerLockChange: (locked: boolean) => void;
}

export function Player({
  playerPosRef,
  enemiesRef,
  isFlying,
  hasWeapon,
  isInvisible,
  isGrimoireOpen,
  onPointerLockChange,
}: PlayerProps) {
  const { camera, gl } = useThree();
  const { scene, animations } = useGLTF(SOLDIER_URL);

  const groupRef = useRef<THREE.Group>(null);
  const tiltGroupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const slashTrailRef = useRef<THREE.Mesh>(null);
  const auraGroupRef = useRef<THREE.Group>(null);
  const weaponGroupRef = useRef<THREE.Group>(null);

  const { actions } = useAnimations(animations, modelRef);
  const currentAnimRef = useRef<string>('');

  const [rightHandBone, setRightHandBone] = useState<THREE.Object3D | null>(null);
  const [handInvScale, setHandInvScale] = useState<number>(1);

  // Physics & input state in refs for 60fps zero-re-render loop
  const velocityRef = useRef(new THREE.Vector3());
  const groundedRef = useRef(true);
  const playerYawRef = useRef(0);
  const camYawRef = useRef(Math.PI);
  const camPitchRef = useRef(0.14);
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

  // Configure shadows and locate mixamorigRightHand bone once loaded
  useEffect(() => {
    scene.updateMatrixWorld(true);
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const hand = scene.getObjectByName('mixamorigRightHand');
    if (hand) {
      const worldScale = new THREE.Vector3();
      hand.getWorldScale(worldScale);
      setHandInvScale(1 / (worldScale.x || 1));
      setRightHandBone(hand);
    }
  }, [scene]);

  // Apply 0.25 opacity to Soldier meshes when [3] Invisibility is active
  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          if (!mat) continue;
          mat.transparent = isInvisible;
          mat.opacity = isInvisible ? 0.25 : 1.0;
          mat.depthWrite = !isInvisible;
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene, isInvisible]);

  // Start with Idle animation
  useEffect(() => {
    const idle = actions['Idle'];
    if (idle) {
      idle.reset().fadeIn(0.2).play();
      currentAnimRef.current = 'Idle';
    }
    return () => {
      Object.values(actions).forEach((action) => action?.stop());
    };
  }, [actions]);

  // Release pointer lock when Grimoire opens so mouse can interact with 3D cards
  useEffect(() => {
    if (isGrimoireOpen) {
      isDraggingRef.current = false;
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isGrimoireOpen, gl]);

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
      if (isGrimoireOpen) return;
      const locked = document.pointerLockElement === dom;
      if (locked || isDraggingRef.current) {
        camYawRef.current -= e.movementX * 0.0032;
        camPitchRef.current = Math.max(
          -0.55,
          Math.min(0.95, camPitchRef.current + e.movementY * 0.0028)
        );
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (isGrimoireOpen) return;
      if (e.button === 0) {
        if (document.pointerLockElement !== dom) {
          dom.requestPointerLock?.();
          isDraggingRef.current = true;
        }
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
  }, [gl, hasWeapon, isGrimoireOpen, onPointerLockChange]);

  const weaponElement = useMemo(() => {
    if (!hasWeapon) return null;
    return (
      <group
        ref={weaponGroupRef}
        scale={handInvScale}
        position={[0, 0.08 * handInvScale, 0.04 * handInvScale]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        {/* Hilt */}
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Crossguard */}
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.28, 0.06, 0.09]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
        </mesh>
        {/* Glowing Energy Blade */}
        <mesh position={[0, 0.78, 0]}>
          <boxGeometry args={[0.085, 1.24, 0.03]} />
          <meshStandardMaterial
            color="#67e8f9"
            emissive="#06b6d4"
            emissiveIntensity={2.2}
            roughness={0.1}
          />
        </mesh>
      </group>
    );
  }, [hasWeapon, handInvScale]);

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

    const yaw = camYawRef.current;
    const pitch = camPitchRef.current;

    if (isFlying) {
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

      const floorY = getTerrainHeight(pos.x, pos.z) + 0.4;
      if (pos.y < floorY) {
        pos.y = floorY;
        if (vel.y < 0) vel.y = 0;
      }
      if (pos.y > 95) pos.y = 95;
      groundedRef.current = false;
    } else {
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

    // Update character root transform
    if (groupRef.current) {
      groupRef.current.position.copy(pos);
      groupRef.current.rotation.y = playerYawRef.current;
    }

    // Blend Soldier animations (Idle / Walk / Run)
    let desiredAnim = 'Idle';
    if (isFlying) {
      desiredAnim = horizSpeed > 2 ? 'Run' : 'Idle';
    } else if (horizSpeed > 0.6) {
      desiredAnim = shift && horizSpeed > 8.5 ? 'Run' : 'Walk';
    }

    if (desiredAnim !== currentAnimRef.current && actions[desiredAnim]) {
      const prev = actions[currentAnimRef.current];
      const next = actions[desiredAnim]!;
      prev?.fadeOut(0.18);
      next.reset().fadeIn(0.18).play();
      currentAnimRef.current = desiredAnim;
    }

    // Forward flight tilt posture
    if (tiltGroupRef.current) {
      const targetTilt = isFlying ? (horizSpeed > 2 ? 0.72 : 0.38) : 0;
      tiltGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        tiltGroupRef.current.rotation.x,
        targetTilt,
        1 - Math.exp(-8 * dt)
      );
      // Subtle body twist during sword swing
      if (attackTimerRef.current > 0) {
        const progress = 1 - attackTimerRef.current / 0.28;
        tiltGroupRef.current.rotation.y = -0.6 + progress * 1.2;
      } else {
        tiltGroupRef.current.rotation.y = THREE.MathUtils.lerp(
          tiltGroupRef.current.rotation.y,
          0,
          1 - Math.exp(-14 * dt)
        );
      }
    }

    // Weapon slash & hit detection
    if (attackCooldownRef.current > 0) {
      attackCooldownRef.current = Math.max(0, attackCooldownRef.current - dt);
    }
    if (attackTimerRef.current > 0) {
      attackTimerRef.current = Math.max(0, attackTimerRef.current - dt);
      const progress = 1 - attackTimerRef.current / 0.28;

      if (weaponGroupRef.current) {
        weaponGroupRef.current.rotation.x = Math.PI / 2 - 0.9 + progress * 1.9;
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = true;
        slashTrailRef.current.rotation.z = -1.1 + progress * 2.2;
      }

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
      if (weaponGroupRef.current) {
        weaponGroupRef.current.rotation.x = Math.PI / 2;
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = false;
      }
    }

    // Flight aura animation
    const t = clock.getElapsedTime();
    if (auraGroupRef.current) {
      auraGroupRef.current.visible = isFlying;
      if (isFlying) {
        auraGroupRef.current.rotation.y = t * 3.2;
        auraGroupRef.current.rotation.z = Math.sin(t * 2) * 0.15;
      }
    }

    // Over-the-shoulder third-person follow camera
    const camDist = isFlying && shift ? 4.6 : 3.7;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const shoulderOffset = 0.58;

    const lookAtY = pos.y + 1.45;
    camTargetRef.current.set(
      pos.x + rightX * (shoulderOffset * 0.65),
      lookAtY,
      pos.z + rightZ * (shoulderOffset * 0.65)
    );

    const horizDist = camDist * Math.cos(pitch);
    const camX = pos.x + Math.sin(yaw) * horizDist + rightX * shoulderOffset;
    const camZ = pos.z + Math.cos(yaw) * horizDist + rightZ * shoulderOffset;
    let camY = lookAtY + camDist * Math.sin(pitch);

    const terrainUnderCam = getTerrainHeight(camX, camZ) + 0.6;
    if (camY < terrainUnderCam) camY = terrainUnderCam;

    camPosRef.current.set(camX, camY, camZ);
    camera.position.lerp(camPosRef.current, 1 - Math.exp(-18 * dt));
    camera.lookAt(camTargetRef.current);
  });

  return (
    <group ref={groupRef} position={[0, getTerrainHeight(0, 0), 0]}>
      <group ref={tiltGroupRef}>
        <group ref={modelRef} rotation={[0, Math.PI, 0]} scale={1.05}>
          <primitive object={scene} />
        </group>
      </group>

      {rightHandBone && weaponElement && createPortal(weaponElement, rightHandBone)}

      {/* Melee Swing Trail */}
      <mesh
        ref={slashTrailRef}
        visible={false}
        position={[0, 1.25, 0.55]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.1, 2.2, 24, 1, -Math.PI * 0.45, Math.PI * 0.9]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.78} side={THREE.DoubleSide} />
      </mesh>

      {/* Flight Wind / Aura Effect */}
      <group ref={auraGroupRef} visible={false} position={[0, 1.05, 0]}>
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

useGLTF.preload(SOLDIER_URL);
