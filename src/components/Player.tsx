import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getGroundHeight } from '../world/terrain';
import { EnemyEntity } from './Enemies';
import { CharacterController } from '../gameplay/character/CharacterController';
import { CharacterAnimationController } from '../gameplay/character/CharacterAnimationController';
import { buildAdventurerAnimationClips } from '../gameplay/character/HumanAnimationClips';
import {
  DEFAULT_CHARACTER_MODEL_URL,
  getMissingStatesForClips,
} from '../gameplay/character/CharacterStates';
import { PLAYER_ATTACK_DAMAGE } from '../gameplay/combat/HealthSystem';
import { EnergySword } from './EnergySword';

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

  const { generatedClips, mixer, actions } = useMemo(() => {
    const hasNativeLocomotion = animations.some((c) => c.name === 'Walk' || c.name === 'Run');
    const clips = hasNativeLocomotion ? animations : buildAdventurerAnimationClips(scene);
    const m = new THREE.AnimationMixer(scene);
    const act: Record<string, THREE.AnimationAction | null> = {};
    for (const clip of clips) {
      act[clip.name] = m.clipAction(clip);
    }
    return { generatedClips: clips, mixer: m, actions: act };
  }, [scene, animations]);

  const controllerRef = useRef<CharacterController>(new CharacterController(0, 0));
  const animControllerRef = useRef<CharacterAnimationController>(
    new CharacterAnimationController()
  );
  const footBonesRef = useRef<THREE.Object3D[]>([]);
  const footPosRef = useRef(new THREE.Vector3());
  const footClearanceRef = useRef<number>(0.06);
  const rightFingersRef = useRef<Array<{ bone: THREE.Object3D; restQuat: THREE.Quaternion; isThumb: boolean }>>([]);

  const [rightHandBone, setRightHandBone] = useState<THREE.Object3D | null>(null);
  const [handInvScale, setHandInvScale] = useState<number>(1);
  const [modelNormScale, setModelNormScale] = useState<number>(1);
  const [modelOffsetY, setModelOffsetY] = useState<number>(0);

  const camYawRef = useRef(Math.PI);
  const camPitchRef = useRef(0.14);
  const isDraggingRef = useRef(false);
  const hitEnemiesThisAttackRef = useRef<Set<string>>(new Set());
  const lastAttackIdRef = useRef<number>(0);

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

  // Configure shadows, PBR lighting, normalize height to ~1.85m, and locate RightHand bone
  useEffect(() => {
    const clipNames = generatedClips.map((c) => c.name);
    const missing = getMissingStatesForClips(clipNames);
    console.info('[Character] Loaded model:', modelUrl, '| Clips:', clipNames);
    if (missing.length > 0) {
      console.warn('[Character] Missing clips for states:', missing.join(', '));
    }

    scene.updateMatrixWorld(true);
    let hand: THREE.Object3D | null = null;
    let headBone: THREE.Object3D | null = null;
    const toeBones: THREE.Object3D[] = [];
    const ankleBones: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        // Hide redundant lower-detail hair LODs that z-fight/blur bangs over the face
        if (/NLOD[123]/i.test(mesh.name)) {
          mesh.visible = false;
          return;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const isEye = /Eye/i.test(mesh.name);
        const isArray = Array.isArray(mesh.material);
        const rawMats: THREE.Material[] = isArray
          ? (mesh.material as THREE.Material[])
          : [mesh.material as THREE.Material];
        const tunedMats = rawMats.map((mat) => {
          if (!mat) return mat;
          const cloned = mat.clone();
          if ((cloned as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const std = cloned as THREE.MeshStandardMaterial;
            const isFace = /Face/i.test(std.name);
            if (isEye) {
              std.emissive = new THREE.Color('#38bdf8');
              std.emissiveIntensity = 0.65;
              std.roughness = 0.25;
              std.envMapIntensity = 0.4;
            } else if (isFace) {
              std.color.set('#f7d8c8');
              std.envMapIntensity = 0.22;
              std.roughness = 0.92;
              if (std.aoMap) std.aoMapIntensity = 0.85;
            } else {
              std.envMapIntensity = 0.45;
              std.roughness = Math.max(std.roughness ?? 0.72, 0.72);
              if (std.aoMap) std.aoMapIntensity = 0.6;
            }
            std.needsUpdate = true;
          }
          return cloned;
        });
        mesh.material = isArray ? tunedMats : tunedMats[0];
      }
      if (!hand && /^(RightHand|Hand\.R|Bip001[\s_]+R[\s_]+Hand)(_\d+)?$/i.test(obj.name)) {
        hand = obj;
      }
      if (!headBone && /^(mixamorig:?Head|Head|Bip001[\s_]+Head)(_\d+)?$/i.test(obj.name)) {
        headBone = obj;
      }
      if (/^((Left|Right)ToeBase|Bip001[\s_]+(L|R)[\s_]+Toe0)(_\d+)?$/i.test(obj.name)) {
        toeBones.push(obj);
      } else if (/^((Left|Right)Foot|Foot\.(L|R)|Bip001[\s_]+(L|R)[\s_]+Foot)(_\d+)?$/i.test(obj.name)) {
        ankleBones.push(obj);
      }
    });

    const activeFeet = toeBones.length > 0 ? toeBones : ankleBones;
    footBonesRef.current = activeFeet;

    // Measure skeleton height in scene-local coordinates (independent of groupRef world Y!)
    let normScale = 1;
    let minLocalFootY = 0;
    if (activeFeet.length > 0 && headBone) {
      let minY = Infinity;
      for (const f of activeFeet) {
        f.getWorldPosition(footPosRef.current);
        scene.worldToLocal(footPosRef.current);
        if (footPosRef.current.y < minY) minY = footPosRef.current.y;
      }
      const headPos = new THREE.Vector3();
      (headBone as THREE.Object3D).getWorldPosition(headPos);
      scene.worldToLocal(headPos);
      const span = headPos.y - minY;
      if (span > 0.1) {
        // Head bone sits ~0.18m below crown of hair, so 1.66m bone span ~= 1.84m total height
        normScale = 1.66 / span;
        minLocalFootY = minY;
      }
    } else {
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      normScale = size.y > 0.01 ? 1.85 / size.y : 1;
      const rootWorld = new THREE.Vector3();
      scene.getWorldPosition(rootWorld);
      minLocalFootY = box.min.y - rootWorld.y;
    }

    const clearance = toeBones.length > 0 ? 0.025 : 0.09;
    footClearanceRef.current = clearance;
    setModelNormScale(normScale);
    setModelOffsetY(-minLocalFootY * normScale + clearance);

    if (hand) {
      const worldScale = new THREE.Vector3();
      (hand as THREE.Object3D).getWorldScale(worldScale);
      const modelWorldScale = new THREE.Vector3();
      scene.getWorldScale(modelWorldScale);
      const relScale = (worldScale.x || 1) / (modelWorldScale.x || 1);
      setHandInvScale(1 / ((relScale || 1) * normScale));
      setRightHandBone(hand);

      // Collect right-hand finger bones for natural weapon grip curling
      const fingers: Array<{ bone: THREE.Object3D; restQuat: THREE.Quaternion; isThumb: boolean }> = [];
      (hand as THREE.Object3D).traverse((child) => {
        if (child === hand) return;
        if (/R[\s_]*Finger\d+/i.test(child.name) && !/_end_/i.test(child.name)) {
          fingers.push({
            bone: child,
            restQuat: child.quaternion.clone(),
            isThumb: /Finger0/i.test(child.name),
          });
        }
      });
      rightFingersRef.current = fingers;
    }
  }, [scene, generatedClips, modelUrl]);

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
    // Bip001 R Hand: +Y points toward fingertips, -Z is palm side, -X is thumb side (forward when arm hangs).
    // Align grip inside palm (y=0.068, z=-0.022) with blade extending out thumb side (-X, tilted slightly forward).
    const isBipedHand = rightHandBone ? /Bip001/i.test(rightHandBone.name) : false;
    const pos: [number, number, number] = isBipedHand
      ? [0.004 * handInvScale, 0.068 * handInvScale, -0.022 * handInvScale]
      : [0, 0.08 * handInvScale, 0.04 * handInvScale];
    const rot: [number, number, number] = isBipedHand
      ? [0, 0, Math.PI / 2 + 0.16]
      : [Math.PI / 2, 0, 0];

    return (
      <EnergySword
        ref={weaponGroupRef}
        scale={handInvScale}
        position={pos}
        rotation={rot}
      />
    );
  }, [hasWeapon, handInvScale, rightHandBone]);

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

    // Update animation state machine & speed-matched AnimationMixer blending
    animControllerRef.current.update(step.state, step.horizSpeed, actions);
    mixer.update(dt);

    // Curl right-hand finger bones naturally around the sword handle when summoned
    if (rightFingersRef.current.length > 0) {
      for (const f of rightFingersRef.current) {
        f.bone.quaternion.copy(f.restQuat);
        if (hasWeapon) {
          if (f.isThumb) {
            f.bone.rotateX(-0.52);
            f.bone.rotateZ(-0.28);
          } else {
            f.bone.rotateX(-0.85);
          }
        }
      }
    }

    // Keep feet grounded on terrain/platforms during grounded animation states
    if (modelRef.current && groupRef.current && step.grounded && step.state !== 'Death') {
      const feet = footBonesRef.current;
      if (feet.length > 0) {
        modelRef.current.updateMatrixWorld(true);
        let minFootY = Infinity;
        for (const bone of feet) {
          bone.getWorldPosition(footPosRef.current);
          groupRef.current.worldToLocal(footPosRef.current);
          if (footPosRef.current.y < minFootY) minFootY = footPosRef.current.y;
        }
        if (minFootY < Infinity) {
          modelRef.current.position.y += footClearanceRef.current - minFootY;
        }
      }
    } else if (modelRef.current && (!step.grounded || step.state === 'Death')) {
      modelRef.current.position.y = THREE.MathUtils.lerp(
        modelRef.current.position.y,
        modelOffsetY,
        1 - Math.exp(-12 * dt)
      );
    }

    // Subtle posture layer for flight tilt, landing squash, hit stagger, & 3-hit attack body motion
    if (tiltGroupRef.current) {
      let targetTiltX = step.flightTiltX;
      let targetTwistY = 0;
      let targetRollZ = step.flightRollZ;

      if (step.comboStep > 0) {
        const p = step.attackProgress;
        if (step.comboStep === 2) {
          targetTwistY = p < 0.22 ? 0.45 * (p / 0.22) : 0.45 - ((p - 0.22) / 0.78) * 1.15;
        } else if (step.comboStep === 3) {
          targetTiltX += p < 0.3 ? -0.16 * (p / 0.3) : 0.28 * Math.sin(((p - 0.3) / 0.7) * Math.PI);
        } else {
          targetTwistY = p < 0.24 ? -0.45 * (p / 0.24) : -0.45 + ((p - 0.24) / 0.76) * 1.15;
          targetTiltX += 0.14 * Math.sin(p * Math.PI);
        }
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

    // Reset hit set whenever a new attack swing (combo step 1, 2, or 3) begins
    if (step.attackId !== lastAttackIdRef.current) {
      lastAttackIdRef.current = step.attackId;
      hitEnemiesThisAttackRef.current.clear();
    }

    // Weapon swing & hit detection synchronized with active attack frames across 3-hit combo
    if (step.comboStep > 0) {
      const p = step.attackProgress;
      if (weaponGroupRef.current) {
        // Subtle wrist snap around grip axis without detaching from palm
        if (step.comboStep === 2) {
          weaponGroupRef.current.rotation.z = Math.PI / 2 + 0.16 - 0.18 + p * 0.36;
        } else if (step.comboStep === 3) {
          weaponGroupRef.current.rotation.z = Math.PI / 2 + 0.16 - 0.25 + p * 0.55;
        } else {
          weaponGroupRef.current.rotation.z = Math.PI / 2 + 0.16 - 0.15 + p * 0.35;
        }
      }
      if (slashTrailRef.current) {
        slashTrailRef.current.visible = step.isAttackActiveHitWindow;
        const trailMat = slashTrailRef.current.material as THREE.MeshBasicMaterial;
        if (step.comboStep === 2) {
          slashTrailRef.current.position.set(0.08, 1.18, 0.72);
          slashTrailRef.current.rotation.set(Math.PI / 2 - 0.22, 0.18, 1.05 - p * 2.1);
          slashTrailRef.current.scale.setScalar(1.05);
          trailMat.color.set('#a78bfa');
        } else if (step.comboStep === 3) {
          slashTrailRef.current.position.set(0.05, 1.25, 0.85);
          slashTrailRef.current.rotation.set(0.22, Math.PI / 2, -1.15 + p * 2.3);
          slashTrailRef.current.scale.setScalar(1.32);
          trailMat.color.set('#fde047');
        } else {
          slashTrailRef.current.position.set(0.08, 1.18, 0.72);
          slashTrailRef.current.rotation.set(Math.PI / 2 + 0.2, -0.18, -1.05 + p * 2.1);
          slashTrailRef.current.scale.setScalar(1.0);
          trailMat.color.set('#67e8f9');
        }
      }

      if (step.isAttackActiveHitWindow) {
        const pFwdX = Math.sin(ctrl.yaw);
        const pFwdZ = Math.cos(ctrl.yaw);
        const damage = step.comboStep === 3 ? PLAYER_ATTACK_DAMAGE + 10 : PLAYER_ATTACK_DAMAGE;
        const knockbackForce = step.comboStep === 3 ? 20 : 13;
        const reach = step.comboStep === 3 ? 4.9 : 4.4;

        for (const enemy of enemiesRef.current) {
          if (!enemy.alive || hitEnemiesThisAttackRef.current.has(enemy.id)) continue;
          const dx = enemy.position.x - ctrl.position.x;
          const dy = enemy.position.y - ctrl.position.y;
          const dz = enemy.position.z - ctrl.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < reach && Math.abs(dy) < 3.5) {
            const dot = (dx * pFwdX + dz * pFwdZ) / (dist || 1);
            if (dist < 2.2 || dot > 0.1) {
              hitEnemiesThisAttackRef.current.add(enemy.id);
              enemy.hitFlash = 0.22;
              enemy.hp = Math.max(0, enemy.hp - damage);
              const invD = 1 / (dist || 1);
              enemy.knockbackX = dx * invD * knockbackForce;
              enemy.knockbackZ = dz * invD * knockbackForce;
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
        const isBipedHand = rightHandBone ? /Bip001/i.test(rightHandBone.name) : false;
        if (isBipedHand) {
          weaponGroupRef.current.rotation.set(0, 0, Math.PI / 2 + 0.16);
        } else {
          weaponGroupRef.current.rotation.set(Math.PI / 2, 0, 0);
        }
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

      {/* Flight Wind / Aura Effect (framed low around feet/lower coat so body & face stay clear) */}
      <group ref={auraGroupRef} visible={false} position={[0, 0.35, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.05, 0.032, 8, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
        </mesh>
        <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2.2, 0.25, 0]}>
          <torusGeometry args={[1.22, 0.024, 8, 32]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.32} />
        </mesh>
      </group>
    </group>
  );
}

useGLTF.preload(DEFAULT_CHARACTER_MODEL_URL);
