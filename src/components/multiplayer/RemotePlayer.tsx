import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterAnimationController } from '../../gameplay/character/CharacterAnimationController';
import {
  CharacterLocomotionState,
  DEFAULT_CHARACTER_MODEL_URL,
} from '../../gameplay/character/CharacterStates';
import { buildAdventurerAnimationClips } from '../../gameplay/character/HumanAnimationClips';
import { EnergySword } from '../EnergySword';
import { RemotePlayerSnapshot } from '../../network/SignalRClient';
import { Nameplate } from './Nameplate';

interface RemotePlayerProps {
  initialSnapshot: RemotePlayerSnapshot;
  snapshotsRef: React.MutableRefObject<Record<string, RemotePlayerSnapshot>>;
}

export function RemotePlayer({ initialSnapshot, snapshotsRef }: RemotePlayerProps) {
  const { scene, animations } = useGLTF(DEFAULT_CHARACTER_MODEL_URL);

  const rootRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Group>(null);
  const hpBarGroupRef = useRef<THREE.Group>(null);
  const hpFillRef = useRef<THREE.Mesh>(null);
  const animCtrlRef = useRef(new CharacterAnimationController());
  const prevHpRef = useRef(initialSnapshot.currentHealth);
  const hitFlashRef = useRef(0);
  const rightFingersRef = useRef<
    Array<{ bone: THREE.Object3D; restQuat: THREE.Quaternion; isThumb: boolean }>
  >([]);
  const targetPosRef = useRef(
    new THREE.Vector3(initialSnapshot.x, initialSnapshot.y, initialSnapshot.z)
  );
  const smoothYawRef = useRef(initialSnapshot.yaw);

  const [rightHandBone, setRightHandBone] = useState<THREE.Object3D | null>(null);
  const [handInvScale, setHandInvScale] = useState<number>(1);
  const [hasWeapon, setHasWeapon] = useState<boolean>(initialSnapshot.hasWeapon);
  const [isInvisible, setIsInvisible] = useState<boolean>(initialSnapshot.isInvisible);

  const { cloned, mixer, actions, normScale, modelOffsetY, clonedMats } = useMemo(() => {
    const c = cloneSkinned(scene);
    c.updateMatrixWorld(true);
    const mats: THREE.Material[] = [];

    let hand: THREE.Object3D | null = null;
    let headBone: THREE.Object3D | null = null;
    const toeBones: THREE.Object3D[] = [];
    const ankleBones: THREE.Object3D[] = [];

    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (/NLOD[123]/i.test(mesh.name)) {
          mesh.visible = false;
          return;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const isEye = /Eye/i.test(mesh.name);
        const isArray = Array.isArray(mesh.material);
        const rawMats = isArray
          ? (mesh.material as THREE.Material[])
          : [mesh.material as THREE.Material];
        const tuned = rawMats.map((m) => {
          if (!m) return m;
          const cm = m.clone();
          if ((cm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const std = cm as THREE.MeshStandardMaterial;
            if (isEye) {
              std.emissive = new THREE.Color('#38bdf8');
              std.emissiveIntensity = 0.65;
            } else if (/Face/i.test(std.name)) {
              std.color.set('#f7d8c8');
              std.envMapIntensity = 0.22;
              std.roughness = 0.92;
            }
          }
          mats.push(cm);
          return cm;
        });
        mesh.material = isArray ? tuned : tuned[0];
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
    let nScale = 1;
    let minLocalY = 0;
    const tmp = new THREE.Vector3();
    if (activeFeet.length > 0 && headBone) {
      let minY = Infinity;
      for (const f of activeFeet) {
        f.getWorldPosition(tmp);
        c.worldToLocal(tmp);
        if (tmp.y < minY) minY = tmp.y;
      }
      const hp = new THREE.Vector3();
      (headBone as THREE.Object3D).getWorldPosition(hp);
      c.worldToLocal(hp);
      const span = hp.y - minY;
      if (span > 0.1) {
        nScale = 1.66 / span;
        minLocalY = minY;
      }
    }

    const clearance = toeBones.length > 0 ? 0.025 : 0.09;
    const offsetY = -minLocalY * nScale + clearance;

    const hasNative = animations.some((clip) => clip.name === 'Walk' || clip.name === 'Run');
    const clips = hasNative ? animations : buildAdventurerAnimationClips(c);
    const m = new THREE.AnimationMixer(c);
    const act: Record<string, THREE.AnimationAction | null> = {};
    for (const clip of clips) {
      act[clip.name] = m.clipAction(clip);
    }

    let invScale = 1;
    const fingers: Array<{ bone: THREE.Object3D; restQuat: THREE.Quaternion; isThumb: boolean }> =
      [];
    if (hand) {
      const ws = new THREE.Vector3();
      (hand as THREE.Object3D).getWorldScale(ws);
      const mws = new THREE.Vector3();
      c.getWorldScale(mws);
      const rel = (ws.x || 1) / (mws.x || 1);
      invScale = 1 / ((rel || 1) * nScale);

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
    }

    return {
      cloned: c,
      mixer: m,
      actions: act,
      normScale: nScale,
      modelOffsetY: offsetY,
      clonedMats: mats,
      foundHand: hand,
      computedInvScale: invScale,
      foundFingers: fingers,
    };
  }, [scene, animations]);

  // Extract hand/fingers once from cloned scene
  useEffect(() => {
    let hand: THREE.Object3D | null = null;
    cloned.traverse((obj) => {
      if (!hand && /^(RightHand|Hand\.R|Bip001[\s_]+R[\s_]+Hand)(_\d+)?$/i.test(obj.name)) {
        hand = obj;
      }
    });
    if (hand) {
      const ws = new THREE.Vector3();
      (hand as THREE.Object3D).getWorldScale(ws);
      const mws = new THREE.Vector3();
      cloned.getWorldScale(mws);
      const rel = (ws.x || 1) / (mws.x || 1);
      setHandInvScale(1 / ((rel || 1) * normScale));
      setRightHandBone(hand);

      const fingers: Array<{ bone: THREE.Object3D; restQuat: THREE.Quaternion; isThumb: boolean }> =
        [];
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

    return () => {
      animCtrlRef.current.dispose(actions);
      clonedMats.forEach((m) => m.dispose());
    };
  }, [cloned, normScale, actions, clonedMats]);

  useEffect(() => {
    for (const mat of clonedMats) {
      mat.transparent = isInvisible;
      mat.opacity = isInvisible ? 0.25 : 1.0;
      mat.depthWrite = !isInvisible;
      mat.needsUpdate = true;
    }
  }, [clonedMats, isInvisible]);

  useFrame(({ camera, clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const snap = snapshotsRef.current[initialSnapshot.playerId] ?? initialSnapshot;

    if (snap.hasWeapon !== hasWeapon) setHasWeapon(snap.hasWeapon);
    if (snap.isInvisible !== isInvisible) setIsInvisible(snap.isInvisible);

    if (snap.currentHealth < prevHpRef.current) {
      hitFlashRef.current = 0.22;
    }
    prevHpRef.current = snap.currentHealth;
    if (hitFlashRef.current > 0) {
      hitFlashRef.current = Math.max(0, hitFlashRef.current - dt);
    }

    for (const mat of clonedMats) {
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = mat as THREE.MeshStandardMaterial;
        if (hitFlashRef.current > 0) {
          std.emissive.set('#ef4444');
          std.emissiveIntensity = 1.1;
        } else if (/Eye/i.test(std.name)) {
          std.emissive.set('#38bdf8');
          std.emissiveIntensity = 0.65;
        } else {
          std.emissive.set('#000000');
          std.emissiveIntensity = 0;
        }
      }
    }

    if (hpBarGroupRef.current && hpFillRef.current) {
      const showHp = snap.isAlive;
      hpBarGroupRef.current.visible = showHp;
      if (showHp) {
        hpBarGroupRef.current.lookAt(camera.position);
        const pct = Math.max(0.01, snap.currentHealth / Math.max(1, snap.maxHealth));
        hpFillRef.current.scale.x = pct;
        hpFillRef.current.position.x = -(1 - pct) * 0.5;
      }
    }

    if (rootRef.current) {
      targetPosRef.current.set(snap.x, snap.y, snap.z);
      rootRef.current.position.lerp(targetPosRef.current, 1 - Math.exp(-14 * dt));

      let diff = snap.yaw - smoothYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      smoothYawRef.current += diff * Math.min(1, 14 * dt);
      rootRef.current.rotation.y = smoothYawRef.current;
    }

    const locoState = (!snap.isAlive
      ? 'Death'
      : snap.locomotionState || 'Idle') as CharacterLocomotionState;
    animCtrlRef.current.update(locoState, snap.horizSpeed ?? 0, actions);
    mixer.update(dt);

    if (rightFingersRef.current.length > 0) {
      for (const f of rightFingersRef.current) {
        f.bone.quaternion.copy(f.restQuat);
        if (snap.hasWeapon) {
          if (f.isThumb) {
            f.bone.rotateX(-0.52);
            f.bone.rotateZ(-0.28);
          } else {
            f.bone.rotateX(-0.85);
          }
        }
      }
    }

    if (auraRef.current) {
      auraRef.current.visible = snap.isFlying;
      if (snap.isFlying) {
        auraRef.current.rotation.y = clock.getElapsedTime() * 3.2;
      }
    }
  });

  const weaponEl = useMemo(() => {
    if (!hasWeapon) return null;
    const isBiped = rightHandBone ? /Bip001/i.test(rightHandBone.name) : false;
    return (
      <EnergySword
        scale={handInvScale}
        position={
          isBiped
            ? [0.004 * handInvScale, 0.068 * handInvScale, -0.022 * handInvScale]
            : [0, 0.08 * handInvScale, 0.04 * handInvScale]
        }
        rotation={isBiped ? [0, 0, Math.PI / 2 + 0.16] : [Math.PI / 2, 0, 0]}
      />
    );
  }, [hasWeapon, handInvScale, rightHandBone]);

  return (
    <group
      ref={rootRef}
      position={[initialSnapshot.x, initialSnapshot.y, initialSnapshot.z]}
      rotation={[0, initialSnapshot.yaw, 0]}
    >
      <Nameplate name={initialSnapshot.characterName} accentColor="#f87171" />
      <group ref={hpBarGroupRef} position={[0, 1.92, 0]}>
        <mesh>
          <planeGeometry args={[1.04, 0.12]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={hpFillRef} position={[0, 0, 0.01]}>
          <planeGeometry args={[1.0, 0.08]} />
          <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={modelRef} position={[0, modelOffsetY, 0]} scale={normScale}>
        <primitive object={cloned} />
      </group>
      {rightHandBone && weaponEl && createPortal(weaponEl, rightHandBone)}
      <group ref={auraRef} visible={false} position={[0, 0.35, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.05, 0.032, 8, 32]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={0.45} />
        </mesh>
      </group>
    </group>
  );
}
