import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getGroundHeight } from '../world/terrain';
import { EnemyEntity } from './Enemies';
import { CharacterController } from '../gameplay/character/CharacterController';
import { CharacterAnimationController } from '../gameplay/character/CharacterAnimationController';
import { ProceduralCharacterAnimator } from '../gameplay/character/ProceduralCharacterAnimator';
import {
  DEFAULT_CHARACTER_MODEL_URL,
  getMissingStatesForClips,
} from '../gameplay/character/CharacterStates';
import { PLAYER_ATTACK_DAMAGE } from '../gameplay/combat/HealthSystem';

export interface PlayerTouchBridge {
  setMove: (x: number, y: number) => void;
  setAction: (action: 'sprint' | 'jump' | 'descend' | 'block', pressed: boolean) => void;
  triggerAttack: () => void;
  triggerDodge: () => void;
}

export interface PlayerCombatBridge {
  triggerHitReaction: () => void;
  triggerDeath: () => void;
  reviveAtStartingPlaza: () => void;
  isBlocking: () => boolean;
}

interface PlayerProps {
  modelUrl?: string;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  enemiesRef: React.MutableRefObject<EnemyEntity[]>;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  isGrimoireOpen: boolean;
  isDead: boolean;
  combatBridgeRef?: React.MutableRefObject<PlayerCombatBridge | null>;
  touchBridgeRef?: React.MutableRefObject<PlayerTouchBridge | null>;
  onPointerLockChange: (locked: boolean) => void;
}

export function Player({
  modelUrl = DEFAULT_CHARACTER_MODEL_URL,
  playerPosRef,
  enemiesRef,
  isFlying,
  hasWeapon,
  isInvisible,
  isGrimoireOpen,
  isDead,
  combatBridgeRef,
  touchBridgeRef,
  onPointerLockChange,
}: PlayerProps) {
  const { camera, gl } = useThree();
  const { scene, animations } = useGLTF(modelUrl);

  const groupRef = useRef<THREE.Group>(null);
  const tiltGroupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const slashTrailRef = useRef<THREE.Mesh>(null);
  const auraGroupRef = useRef<THREE.Group>(null);
  const weaponGroupRef = useRef<THREE.Group>(null);

  const { actions, mixer } = useAnimations(animations, modelRef);

  const controllerRef = useRef<CharacterController>(new CharacterController(0, 0));
  const animControllerRef = useRef<CharacterAnimationController>(
    new CharacterAnimationController()
  );
  const proceduralAnimRef = useRef<ProceduralCharacterAnimator>(new ProceduralCharacterAnimator());
  const useProceduralRef = useRef<boolean>(false);

  const [rightHandBone, setRightHandBone] = useState<THREE.Object3D | null>(null);
  const [handInvScale, setHandInvScale] = useState<number>(1);
  const [modelNormScale, setModelNormScale] = useState<number>(1);
  const [modelOffsetY, setModelOffsetY] = useState<number>(0);

  const camYawRef = useRef(Math.PI);
  const camPitchRef = useRef(0.14);
  const isDraggingRef = useRef(false);
  const hitEnemiesThisAttackRef = useRef<Set<string>>(new Set());

  // Reusable camera vectors
  const camTargetRef = useRef(new THREE.Vector3());
  const camPosRef = useRef(new THREE.Vector3());

  // Expose combat & touch bridges to parent
  useEffect(() => {
    if (combatBridgeRef) {
      combatBridgeRef.current = {
        triggerHitReaction: () => {
          controllerRef.current.triggerHitReaction(hasWeapon, isGrimoireOpen);
        },
        triggerDeath: () => {
          controllerRef.current.triggerDeath();
        },
        reviveAtStartingPlaza: () => {
          controllerRef.current.reviveAt(0, 0);
        },
        isBlocking: () => hasWeapon && controllerRef.current.getIsBlocking(),
      };
    }
    if (touchBridgeRef) {
      touchBridgeRef.current = {
        setMove: (x, y) => controllerRef.current.setTouchMove(x, y),
        setAction: (action, pressed) => controllerRef.current.setTouchAction(action, pressed),
        triggerAttack: () => {
          if (controllerRef.current.triggerAttack(hasWeapon, isGrimoireOpen)) {
            hitEnemiesThisAttackRef.current.clear();
          }
        },
        triggerDodge: () => {
          controllerRef.current.triggerDodge(isFlying, isGrimoireOpen);
        },
      };
    }
    return () => {
      if (combatBridgeRef) combatBridgeRef.current = null;
      if (touchBridgeRef) touchBridgeRef.current = null;
    };
  }, [combatBridgeRef, touchBridgeRef, hasWeapon, isFlying, isGrimoireOpen]);

  // Configure shadows, normalize height to ~1.85m, log clips, and locate RightHand bone
  useEffect(() => {
    const clipNames = animations.map((c) => c.name);
    const clipSummary = animations.map((c) => `${c.name} (${c.duration.toFixed(2)}s)`);
    const missing = getMissingStatesForClips(clipNames);
    console.info('[Character] Loaded model:', modelUrl, '| Clips:', clipSummary);
    if (missing.length > 0) {
      console.warn('[Character] Missing native clips for states:', missing.join(', '));
    }

    const hasNativeLocomotion = clipNames.includes('Walk') || clipNames.includes('Run');
    const procOk = !hasNativeLocomotion && proceduralAnimRef.current.init(scene);
    useProceduralRef.current = procOk;
    if (procOk) {
      mixer.stopAllAction();
    }

    scene.updateMatrixWorld(true);
    let hand: THREE.Object3D | null = null;
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const std = mat as THREE.MeshStandardMaterial;
            std.envMapIntensity = 1.45;
            if (std.aoMap) {
              std.aoMapIntensity = 0.45;
            }
            std.needsUpdate = true;
          }
        }
      }
      if (!hand && /RightHand(_\d+)?$/i.test(obj.name)) {
        hand = obj;
      }
    });

    // Normalize model height to ~1.85 units and ground feet at y=0
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const normScale = size.y > 0.01 ? 1.85 / size.y : 1;
    setModelNormScale(normScale);
    setModelOffsetY(-box.min.y * normScale);

    if (hand) {
      const worldScale = new THREE.Vector3();
      (hand as THREE.Object3D).getWorldScale(worldScale);
      setHandInvScale(1 / ((worldScale.x || 1) * normScale));
      setRightHandBone(hand);
    }
  }, [scene, animations, modelUrl]);

  // Apply 0.25 opacity to character meshes when [3] Invisibility is active
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

  // Bind AnimationMixer 'finished' event and clean up animation actions on unmount
  useEffect(() => {
    const animCtrl = animControllerRef.current;
    animCtrl.bindMixer(mixer, (finishedState) => {
      controllerRef.current.completeOneShotState(finishedState);
    });
    return () => {
      animCtrl.dispose(actions);
    };
  }, [actions, mixer]);

  // Clear held inputs and release pointer lock when Grimoire opens or player dies
  useEffect(() => {
    if (isGrimoireOpen || isDead) {
      controllerRef.current.clearInputs();
      isDraggingRef.current = false;
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isGrimoireOpen, isDead, gl]);

  // Keyboard, mouse, and window focus listeners
  useEffect(() => {
    const dom = gl.domElement;
    const ctrl = controllerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGrimoireOpen) return;
      if (e.code === 'KeyQ' && !e.repeat) {
        ctrl.triggerDodge(isFlying, isGrimoireOpen);
      }
      ctrl.setKey(e.code, true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      ctrl.setKey(e.code, false);
    };
    const handleWindowBlur = () => {
      ctrl.clearInputs();
      isDraggingRef.current = false;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        ctrl.clearInputs();
        isDraggingRef.current = false;
      }
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
        if (ctrl.triggerAttack(hasWeapon, isGrimoireOpen)) {
          hitEnemiesThisAttackRef.current.clear();
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

    // Touch-drag camera orbit on the 3D canvas (supports multi-touch alongside joystick)
    let activeTouchId: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (isGrimoireOpen || activeTouchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      activeTouchId = t.identifier;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isGrimoireOpen || activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeTouchId) {
          const dx = t.clientX - lastTouchX;
          const dy = t.clientY - lastTouchY;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
          camYawRef.current -= dx * 0.0055;
          camPitchRef.current = Math.max(
            -0.55,
            Math.min(0.95, camPitchRef.current + dy * 0.0045)
          );
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    dom.addEventListener('mousedown', handleMouseDown);
    dom.addEventListener('touchstart', handleTouchStart, { passive: true });
    dom.addEventListener('touchmove', handleTouchMove, { passive: true });
    dom.addEventListener('touchend', handleTouchEnd, { passive: true });
    dom.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    document.addEventListener('pointerlockchange', handlePointerLock);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dom.removeEventListener('mousedown', handleMouseDown);
      dom.removeEventListener('touchstart', handleTouchStart);
      dom.removeEventListener('touchmove', handleTouchMove);
      dom.removeEventListener('touchend', handleTouchEnd);
      dom.removeEventListener('touchcancel', handleTouchEnd);
      document.removeEventListener('pointerlockchange', handlePointerLock);
    };
  }, [gl, hasWeapon, isFlying, isGrimoireOpen, onPointerLockChange]);

  const weaponElement = useMemo(() => {
    if (!hasWeapon) return null;
    return (
      <group
        ref={weaponGroupRef}
        scale={handInvScale}
        position={[0, 0.08 * handInvScale, 0.04 * handInvScale]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.28, 0.06, 0.09]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
        </mesh>
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
    const ctrl = controllerRef.current;

    const step = ctrl.update(
      dt,
      camYawRef.current,
      camPitchRef.current,
      isFlying,
      hasWeapon,
      isGrimoireOpen
    );

    // Sync shared player position ref for Enemies & World
    playerPosRef.current.copy(ctrl.position);

    // Update character root transform
    if (groupRef.current) {
      groupRef.current.position.copy(ctrl.position);
      groupRef.current.rotation.y = ctrl.yaw;
    }

    // Update animation state machine (procedural Mixamo rig if native locomotion clips are absent)
    if (useProceduralRef.current) {
      proceduralAnimRef.current.update(dt, step, hasWeapon, clock.getElapsedTime());
      if (modelRef.current && groupRef.current && step.grounded && step.state !== 'Death') {
        modelRef.current.updateMatrixWorld(true);
        const lowestFootY = proceduralAnimRef.current.getLowestFootLocalY(groupRef.current);
        if (lowestFootY !== null) {
          const desiredSoleClearance = 0.045;
          modelRef.current.position.y += desiredSoleClearance - lowestFootY;
        }
      } else if (modelRef.current && !step.grounded) {
        modelRef.current.position.y = THREE.MathUtils.lerp(
          modelRef.current.position.y,
          modelOffsetY,
          1 - Math.exp(-12 * dt)
        );
      }
    } else {
      animControllerRef.current.update(step.state, step.horizSpeed, actions);
    }

    // Subtle posture layer for flight tilt, landing squash, hit stagger, & attack anticipation/recovery
    if (tiltGroupRef.current) {
      let targetTiltX = step.flightTiltX;
      let targetTwistY = 0;
      let targetRollZ = step.flightRollZ;

      if (step.state === 'Attack') {
        const p = step.attackProgress;
        targetTwistY = p < 0.24 ? -0.45 * (p / 0.24) : -0.45 + ((p - 0.24) / 0.76) * 1.15;
        targetTiltX += 0.14 * Math.sin(p * Math.PI);
      } else if (step.state === 'HitReaction') {
        targetTiltX = -0.28 * Math.sin(step.hitReactionProgress * Math.PI);
      } else if (step.state === 'Land') {
        targetTiltX = 0.14;
      }

      const postureLerp = 1 - Math.exp(-12 * dt);
      tiltGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        tiltGroupRef.current.rotation.x,
        targetTiltX,
        postureLerp
      );
      tiltGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        tiltGroupRef.current.rotation.y,
        targetTwistY,
        postureLerp
      );
      tiltGroupRef.current.rotation.z = THREE.MathUtils.lerp(
        tiltGroupRef.current.rotation.z,
        targetRollZ,
        postureLerp
      );
    }

    // Weapon swing & hit detection synchronized with active attack frames
    if (step.state === 'Attack') {
      const p = step.attackProgress;
      if (weaponGroupRef.current) {
        weaponGroupRef.current.rotation.x = Math.PI / 2 - 0.9 + p * 1.9;
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = step.isAttackActiveHitWindow;
        slashTrailRef.current.rotation.z = -1.1 + p * 2.2;
      }

      if (step.isAttackActiveHitWindow) {
        const pFwdX = Math.sin(ctrl.yaw);
        const pFwdZ = Math.cos(ctrl.yaw);

        for (const enemy of enemiesRef.current) {
          if (!enemy.alive || hitEnemiesThisAttackRef.current.has(enemy.id)) continue;
          const dx = enemy.position.x - ctrl.position.x;
          const dy = enemy.position.y - ctrl.position.y;
          const dz = enemy.position.z - ctrl.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 4.5 && Math.abs(dy) < 3.5) {
            const dot = (dx * pFwdX + dz * pFwdZ) / (dist || 1);
            if (dist < 2.2 || dot > 0.15) {
              hitEnemiesThisAttackRef.current.add(enemy.id);
              enemy.hitFlash = 0.22;
              enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE);
              const invD = 1 / (dist || 1);
              enemy.knockbackX = dx * invD * 14;
              enemy.knockbackZ = dz * invD * 14;
              if (enemy.hp <= 0) {
                enemy.alive = false;
                enemy.chasing = false;
                enemy.respawnTimer = 14;
              }
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
    const yaw = camYawRef.current;
    const pitch = camPitchRef.current;
    const camDist = isFlying && step.horizSpeed > 18 ? 4.6 : 3.7;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const shoulderOffset = 0.58;

    const lookAtY = ctrl.position.y + 1.45;
    camTargetRef.current.set(
      ctrl.position.x + rightX * (shoulderOffset * 0.65),
      lookAtY,
      ctrl.position.z + rightZ * (shoulderOffset * 0.65)
    );

    const horizDist = camDist * Math.cos(pitch);
    const camX = ctrl.position.x + Math.sin(yaw) * horizDist + rightX * shoulderOffset;
    const camZ = ctrl.position.z + Math.cos(yaw) * horizDist + rightZ * shoulderOffset;
    let camY = lookAtY + camDist * Math.sin(pitch);

    const terrainUnderCam = getGroundHeight(camX, camZ) + 0.6;
    if (camY < terrainUnderCam) camY = terrainUnderCam;

    camPosRef.current.set(camX, camY, camZ);
    camera.position.lerp(camPosRef.current, 1 - Math.exp(-18 * dt));
    camera.lookAt(camTargetRef.current);
  });

  const isSoldierModel = modelUrl.includes('Soldier.glb');

  return (
    <group ref={groupRef} position={[0, getGroundHeight(0, 0), 0]}>
      <group ref={tiltGroupRef}>
        <group
          ref={modelRef}
          position={[0, modelOffsetY, 0]}
          rotation={[0, isSoldierModel ? Math.PI : 0, 0]}
          scale={modelNormScale}
        >
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

useGLTF.preload(DEFAULT_CHARACTER_MODEL_URL);
