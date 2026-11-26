import * as THREE from 'three';

interface BoneBindInfo {
  bone: THREE.Bone;
  bindLocalQuat: THREE.Quaternion;
  worldBindQuat: THREE.Quaternion;
  worldBindQuatInv: THREE.Quaternion;
  hipsRestPos: THREE.Vector3;
  hipsUnitScale: number;
}

type PoseSpec = Record<string, [number, number, number]>;

function charDeltaQuat(
  info: BoneBindInfo,
  rx: number,
  ry: number,
  rz: number
): [number, number, number, number] {
  const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
  const charQ = new THREE.Quaternion().setFromEuler(euler);
  const deltaLocal = info.worldBindQuatInv.clone().multiply(charQ).multiply(info.worldBindQuat);
  const target = info.bindLocalQuat.clone().multiply(deltaLocal).normalize();
  return [target.x, target.y, target.z, target.w];
}

function makePoseClip(
  name: string,
  duration: number,
  keyframes: Array<{ time: number; pose: PoseSpec; hipsOffsetY?: number }>,
  bindMap: Map<string, BoneBindInfo>
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const boneNames = new Set<string>();
  keyframes.forEach((kf) => Object.keys(kf.pose).forEach((b) => boneNames.add(b)));

  const times = keyframes.map((kf) => kf.time);

  for (const boneName of boneNames) {
    const info = bindMap.get(boneName);
    if (!info) continue;
    const values: number[] = [];
    for (const kf of keyframes) {
      const rot = kf.pose[boneName] ?? [0, 0, 0];
      const q = charDeltaQuat(info, rot[0], rot[1], rot[2]);
      values.push(q[0], q[1], q[2], q[3]);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }

  const hipsInfo = bindMap.get('Hips');
  if (hipsInfo && keyframes.some((kf) => kf.hipsOffsetY !== undefined)) {
    const posValues: number[] = [];
    for (const kf of keyframes) {
      posValues.push(
        hipsInfo.hipsRestPos.x,
        hipsInfo.hipsRestPos.y + (kf.hipsOffsetY ?? 0) * hipsInfo.hipsUnitScale,
        hipsInfo.hipsRestPos.z
      );
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posValues));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Builds complete, keyframed THREE.AnimationClips directly bound to the
 * `adventurer_human.glb` (Quaternius Modular Men Adventurer) skeleton.
 * Driven 100% by THREE.AnimationMixer + CharacterAnimationController.
 */
export function buildAdventurerAnimationClips(scene: THREE.Object3D): THREE.AnimationClip[] {
  scene.updateMatrixWorld(true);

  const bindMap = new Map<string, BoneBindInfo>();
  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      const worldQ = new THREE.Quaternion();
      bone.getWorldQuaternion(worldQ).normalize();
      const restPos = bone.position.clone();
      bindMap.set(bone.name, {
        bone,
        bindLocalQuat: bone.quaternion.clone().normalize(),
        worldBindQuat: worldQ,
        worldBindQuatInv: worldQ.clone().invert(),
        hipsRestPos: restPos,
        hipsUnitScale: restPos.length() > 0.2 ? 1 : 0.01,
      });
    }
  });

  if (bindMap.size === 0) return [];

  // Relaxed arm-down angle from horizontal T-pose (~70 degrees down)
  const armDown = 1.22;

  const clips: THREE.AnimationClip[] = [
    // 1. Relaxed Non-Combat Idle
    makePoseClip(
      'Idle',
      2.4,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, 0, 0],
            Chest: [-0.02, 0, 0],
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.18, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.18, 0, armDown],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.04, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.04, 0, 0],
          },
        },
        {
          time: 1.2,
          hipsOffsetY: 0.012,
          pose: {
            Torso: [0.04, 0.02, 0],
            Chest: [0.01, 0, 0],
            Head: [0, 0.03, 0],
            'UpperArm.L': [0.06, 0, -(armDown - 0.03)],
            'LowerArm.L': [-0.22, 0, -(armDown - 0.03)],
            'UpperArm.R': [0.06, 0, armDown - 0.03],
            'LowerArm.R': [-0.22, 0, armDown - 0.03],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.04, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.04, 0, 0],
          },
        },
        {
          time: 2.4,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, 0, 0],
            Chest: [-0.02, 0, 0],
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.18, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.18, 0, armDown],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.04, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.04, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 2. Natural Bipedal Walk Cycle (0.8s loop)
    makePoseClip(
      'Walk',
      0.8,
      [
        {
          time: 0,
          hipsOffsetY: -0.01,
          pose: {
            Hips: [0.04, 0.08, 0],
            Torso: [0.05, -0.08, 0],
            'UpperLeg.L': [-0.46, 0, 0.02],
            'LowerLeg.L': [0.15, 0, 0],
            'Foot.L': [-0.12, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.22, 0, 0],
            'Foot.R': [0.2, 0, 0],
            'UpperArm.L': [0.38, 0, -armDown],
            'LowerArm.L': [-0.25, 0, -armDown],
            'UpperArm.R': [-0.38, 0, armDown],
            'LowerArm.R': [-0.45, 0, armDown],
          },
        },
        {
          time: 0.2,
          hipsOffsetY: 0.025,
          pose: {
            Hips: [0.04, 0, 0.02],
            Torso: [0.05, 0, 0],
            'UpperLeg.L': [-0.05, 0, 0.02],
            'LowerLeg.L': [0.08, 0, 0],
            'Foot.L': [0, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.02],
            'LowerLeg.R': [0.68, 0, 0],
            'Foot.R': [-0.15, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.28, 0, -armDown],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.28, 0, armDown],
          },
        },
        {
          time: 0.4,
          hipsOffsetY: -0.01,
          pose: {
            Hips: [0.04, -0.08, 0],
            Torso: [0.05, 0.08, 0],
            'UpperLeg.L': [0.42, 0, 0.02],
            'LowerLeg.L': [0.22, 0, 0],
            'Foot.L': [0.2, 0, 0],
            'UpperLeg.R': [-0.46, 0, -0.02],
            'LowerLeg.R': [0.15, 0, 0],
            'Foot.R': [-0.12, 0, 0],
            'UpperArm.L': [-0.38, 0, -armDown],
            'LowerArm.L': [-0.45, 0, -armDown],
            'UpperArm.R': [0.38, 0, armDown],
            'LowerArm.R': [-0.25, 0, armDown],
          },
        },
        {
          time: 0.6,
          hipsOffsetY: 0.025,
          pose: {
            Hips: [0.04, 0, -0.02],
            Torso: [0.05, 0, 0],
            'UpperLeg.L': [-0.18, 0, 0.02],
            'LowerLeg.L': [0.68, 0, 0],
            'Foot.L': [-0.15, 0, 0],
            'UpperLeg.R': [-0.05, 0, -0.02],
            'LowerLeg.R': [0.08, 0, 0],
            'Foot.R': [0, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.28, 0, -armDown],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.28, 0, armDown],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.01,
          pose: {
            Hips: [0.04, 0.08, 0],
            Torso: [0.05, -0.08, 0],
            'UpperLeg.L': [-0.46, 0, 0.02],
            'LowerLeg.L': [0.15, 0, 0],
            'Foot.L': [-0.12, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.22, 0, 0],
            'Foot.R': [0.2, 0, 0],
            'UpperArm.L': [0.38, 0, -armDown],
            'LowerArm.L': [-0.25, 0, -armDown],
            'UpperArm.R': [-0.38, 0, armDown],
            'LowerArm.R': [-0.45, 0, armDown],
          },
        },
      ],
      bindMap
    ),

    // 3. Athletic Run / Sprint Cycle (0.56s loop)
    makePoseClip(
      'Run',
      0.56,
      [
        {
          time: 0,
          hipsOffsetY: -0.03,
          pose: {
            Hips: [0.12, 0.12, 0],
            Torso: [0.18, -0.15, 0],
            Head: [-0.14, 0, 0],
            'UpperLeg.L': [-0.78, 0, 0.02],
            'LowerLeg.L': [0.32, 0, 0],
            'Foot.L': [-0.15, 0, 0],
            'UpperLeg.R': [0.68, 0, -0.02],
            'LowerLeg.R': [0.45, 0, 0],
            'Foot.R': [0.3, 0, 0],
            'UpperArm.L': [0.68, 0, -armDown],
            'LowerArm.L': [-0.85, 0, -armDown],
            'UpperArm.R': [-0.68, 0, armDown],
            'LowerArm.R': [-1.05, 0, armDown],
          },
        },
        {
          time: 0.14,
          hipsOffsetY: 0.04,
          pose: {
            Hips: [0.12, 0, 0],
            Torso: [0.18, 0, 0],
            Head: [-0.14, 0, 0],
            'UpperLeg.L': [-0.1, 0, 0.02],
            'LowerLeg.L': [0.18, 0, 0],
            'UpperLeg.R': [-0.45, 0, -0.02],
            'LowerLeg.R': [1.25, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.85, 0, -armDown],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.85, 0, armDown],
          },
        },
        {
          time: 0.28,
          hipsOffsetY: -0.03,
          pose: {
            Hips: [0.12, -0.12, 0],
            Torso: [0.18, 0.15, 0],
            Head: [-0.14, 0, 0],
            'UpperLeg.L': [0.68, 0, 0.02],
            'LowerLeg.L': [0.45, 0, 0],
            'Foot.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.78, 0, -0.02],
            'LowerLeg.R': [0.32, 0, 0],
            'Foot.R': [-0.15, 0, 0],
            'UpperArm.L': [-0.68, 0, -armDown],
            'LowerArm.L': [-1.05, 0, -armDown],
            'UpperArm.R': [0.68, 0, armDown],
            'LowerArm.R': [-0.85, 0, armDown],
          },
        },
        {
          time: 0.42,
          hipsOffsetY: 0.04,
          pose: {
            Hips: [0.12, 0, 0],
            Torso: [0.18, 0, 0],
            Head: [-0.14, 0, 0],
            'UpperLeg.L': [-0.45, 0, 0.02],
            'LowerLeg.L': [1.25, 0, 0],
            'UpperLeg.R': [-0.1, 0, -0.02],
            'LowerLeg.R': [0.18, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.85, 0, -armDown],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.85, 0, armDown],
          },
        },
        {
          time: 0.56,
          hipsOffsetY: -0.03,
          pose: {
            Hips: [0.12, 0.12, 0],
            Torso: [0.18, -0.15, 0],
            Head: [-0.14, 0, 0],
            'UpperLeg.L': [-0.78, 0, 0.02],
            'LowerLeg.L': [0.32, 0, 0],
            'Foot.L': [-0.15, 0, 0],
            'UpperLeg.R': [0.68, 0, -0.02],
            'LowerLeg.R': [0.45, 0, 0],
            'Foot.R': [0.3, 0, 0],
            'UpperArm.L': [0.68, 0, -armDown],
            'LowerArm.L': [-0.85, 0, -armDown],
            'UpperArm.R': [-0.68, 0, armDown],
            'LowerArm.R': [-1.05, 0, armDown],
          },
        },
      ],
      bindMap
    ),

    // 4. Weapon-gated CombatIdle
    makePoseClip(
      'CombatIdle',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.06, -0.25, 0],
            Torso: [0.08, 0.16, 0],
            'UpperArm.L': [-0.25, 0.2, -0.95],
            'LowerArm.L': [-0.65, 0, -0.95],
            'UpperArm.R': [-0.55, -0.2, 0.95],
            'LowerArm.R': [-0.75, 0.15, 0.95],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.035,
          pose: {
            Hips: [0.06, -0.25, 0],
            Torso: [0.1, 0.18, 0],
            'UpperArm.L': [-0.28, 0.2, -0.92],
            'LowerArm.L': [-0.68, 0, -0.92],
            'UpperArm.R': [-0.58, -0.2, 0.92],
            'LowerArm.R': [-0.78, 0.15, 0.92],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.06, -0.25, 0],
            Torso: [0.08, 0.16, 0],
            'UpperArm.L': [-0.25, 0.2, -0.95],
            'LowerArm.L': [-0.65, 0, -0.95],
            'UpperArm.R': [-0.55, -0.2, 0.95],
            'LowerArm.R': [-0.75, 0.15, 0.95],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 5. JumpStart / JumpLoop / Fall / Land
    makePoseClip(
      'JumpStart',
      0.22,
      [
        {
          time: 0,
          hipsOffsetY: -0.08,
          pose: {
            Torso: [0.16, 0, 0],
            'UpperLeg.L': [-0.45, 0, 0.04],
            'LowerLeg.L': [0.78, 0, 0],
            'UpperLeg.R': [-0.45, 0, -0.04],
            'LowerLeg.R': [0.78, 0, 0],
            'UpperArm.L': [0.25, 0, -armDown],
            'UpperArm.R': [0.25, 0, armDown],
          },
        },
        {
          time: 0.22,
          hipsOffsetY: 0.02,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.55, 0, 0.05],
            'LowerLeg.L': [0.85, 0, 0],
            'UpperLeg.R': [-0.15, 0, -0.05],
            'LowerLeg.R': [0.42, 0, 0],
            'UpperArm.L': [-0.65, 0, -0.8],
            'LowerArm.L': [-0.45, 0, -0.8],
            'UpperArm.R': [-0.65, 0, 0.8],
            'LowerArm.R': [-0.45, 0, 0.8],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'JumpLoop',
      0.8,
      [
        {
          time: 0,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.48, 0, 0.05],
            'LowerLeg.L': [0.78, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.05],
            'LowerLeg.R': [0.4, 0, 0],
            'UpperArm.L': [-0.48, 0, -0.85],
            'LowerArm.L': [-0.45, 0, -0.85],
            'UpperArm.R': [-0.48, 0, 0.85],
            'LowerArm.R': [-0.45, 0, 0.85],
          },
        },
        {
          time: 0.8,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.48, 0, 0.05],
            'LowerLeg.L': [0.78, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.05],
            'LowerLeg.R': [0.4, 0, 0],
            'UpperArm.L': [-0.48, 0, -0.85],
            'LowerArm.L': [-0.45, 0, -0.85],
            'UpperArm.R': [-0.48, 0, 0.85],
            'LowerArm.R': [-0.45, 0, 0.85],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Fall',
      0.8,
      [
        {
          time: 0,
          pose: {
            Torso: [0.05, 0, 0],
            'UpperLeg.L': [-0.28, 0, 0.05],
            'LowerLeg.L': [0.48, 0, 0],
            'UpperLeg.R': [-0.14, 0, -0.05],
            'LowerLeg.R': [0.32, 0, 0],
            'UpperArm.L': [-0.25, 0, -0.65],
            'LowerArm.L': [-0.4, 0, -0.65],
            'UpperArm.R': [-0.25, 0, 0.65],
            'LowerArm.R': [-0.4, 0, 0.65],
          },
        },
        {
          time: 0.8,
          pose: {
            Torso: [0.05, 0, 0],
            'UpperLeg.L': [-0.28, 0, 0.05],
            'LowerLeg.L': [0.48, 0, 0],
            'UpperLeg.R': [-0.14, 0, -0.05],
            'LowerLeg.R': [0.32, 0, 0],
            'UpperArm.L': [-0.25, 0, -0.65],
            'LowerArm.L': [-0.4, 0, -0.65],
            'UpperArm.R': [-0.25, 0, 0.65],
            'LowerArm.R': [-0.4, 0, 0.65],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Land',
      0.18,
      [
        {
          time: 0,
          hipsOffsetY: -0.14,
          pose: {
            Torso: [0.18, 0, 0],
            'UpperLeg.L': [-0.45, 0, 0.05],
            'LowerLeg.L': [0.78, 0, 0],
            'UpperLeg.R': [-0.45, 0, -0.05],
            'LowerLeg.R': [0.78, 0, 0],
            'UpperArm.L': [0.15, 0, -armDown],
            'UpperArm.R': [0.15, 0, armDown],
          },
        },
        {
          time: 0.18,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.04, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
          },
        },
      ],
      bindMap
    ),

    // 6. Sword Attack, Block, Dodge, HitReaction, Death
    makePoseClip(
      'Attack',
      0.42,
      [
        {
          time: 0,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.2, 0],
            Chest: [0.08, -0.35, 0],
            'UpperArm.R': [-0.9, -0.5, 0.8],
            'LowerArm.R': [-0.55, 0, 0.8],
            'UpperArm.L': [-0.25, 0, -armDown],
            'UpperLeg.L': [-0.24, 0, 0.06],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.2, 0, -0.06],
            'LowerLeg.R': [0.26, 0, 0],
          },
        },
        {
          time: 0.12,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.3, 0],
            Chest: [0.12, -0.45, 0],
            'UpperArm.R': [-1.15, -0.65, 0.7],
            'LowerArm.R': [-0.45, 0, 0.7],
            'UpperArm.L': [-0.2, 0, -armDown],
          },
        },
        {
          time: 0.26,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.25, 0],
            Chest: [0.14, 0.45, 0],
            'UpperArm.R': [-0.55, 0.75, 0.85],
            'LowerArm.R': [-0.25, 0, 0.85],
            'UpperArm.L': [-0.15, 0, -armDown],
          },
        },
        {
          time: 0.42,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.1, 0],
            Chest: [0.08, 0.18, 0],
            'UpperArm.R': [-0.65, 0.2, 0.9],
            'LowerArm.R': [-0.65, 0, 0.9],
            'UpperArm.L': [-0.25, 0, -armDown],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Block',
      0.8,
      [
        {
          time: 0,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.2, 0],
            Chest: [0.1, 0.15, 0],
            'UpperArm.R': [-0.95, 0.45, 0.85],
            'LowerArm.R': [-1.05, -0.35, 0.85],
            'UpperArm.L': [-0.55, -0.2, -0.9],
            'LowerArm.L': [-0.8, 0, -0.9],
            'UpperLeg.L': [-0.28, 0, 0.06],
            'LowerLeg.L': [0.44, 0, 0],
            'UpperLeg.R': [0.22, 0, -0.06],
            'LowerLeg.R': [0.3, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.2, 0],
            Chest: [0.1, 0.15, 0],
            'UpperArm.R': [-0.95, 0.45, 0.85],
            'LowerArm.R': [-1.05, -0.35, 0.85],
            'UpperArm.L': [-0.55, -0.2, -0.9],
            'LowerArm.L': [-0.8, 0, -0.9],
            'UpperLeg.L': [-0.28, 0, 0.06],
            'LowerLeg.L': [0.44, 0, 0],
            'UpperLeg.R': [0.22, 0, -0.06],
            'LowerLeg.R': [0.3, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Dodge',
      0.36,
      [
        {
          time: 0,
          hipsOffsetY: -0.14,
          pose: {
            Hips: [0.26, 0, 0],
            Chest: [0.32, 0, 0],
            'UpperLeg.L': [-0.55, 0, 0.05],
            'LowerLeg.L': [0.88, 0, 0],
            'UpperLeg.R': [0.25, 0, -0.05],
            'LowerLeg.R': [0.55, 0, 0],
            'UpperArm.L': [0.42, 0, -armDown],
            'UpperArm.R': [0.42, 0, armDown],
          },
        },
        {
          time: 0.36,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.08, 0, 0],
            Chest: [0.1, 0, 0],
            'UpperArm.L': [0.1, 0, -armDown],
            'UpperArm.R': [0.1, 0, armDown],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'HitReaction',
      0.35,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.04, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
          },
        },
        {
          time: 0.14,
          hipsOffsetY: -0.04,
          pose: {
            Torso: [-0.28, 0, 0],
            Head: [-0.32, 0, 0],
            'UpperArm.L': [-0.25, 0, -0.9],
            'UpperArm.R': [-0.25, 0, 0.9],
          },
        },
        {
          time: 0.35,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.04, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Death',
      0.85,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [-0.15, 0, 0],
            'UpperArm.L': [0.04, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
          },
        },
        {
          time: 0.45,
          hipsOffsetY: -0.42,
          pose: {
            Hips: [0.65, 0, 0],
            'UpperLeg.L': [-0.45, 0, 0.08],
            'LowerLeg.L': [0.85, 0, 0],
            'UpperLeg.R': [-0.35, 0, -0.08],
            'LowerLeg.R': [0.75, 0, 0],
            'UpperArm.L': [-0.4, 0, -0.8],
            'UpperArm.R': [-0.4, 0, 0.8],
          },
        },
        {
          time: 0.85,
          hipsOffsetY: -0.82,
          pose: {
            Hips: [1.45, 0, 0],
            Chest: [0.2, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.1],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.15, 0, -0.1],
            'LowerLeg.R': [0.25, 0, 0],
            'UpperArm.L': [-0.35, 0, -0.6],
            'UpperArm.R': [-0.35, 0, 0.6],
          },
        },
      ],
      bindMap
    ),

    // 7. Flight Hover & Forward Flight
    makePoseClip(
      'FlightHover',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.04, 0, 0],
            'UpperLeg.L': [-0.16, 0, 0.05],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [-0.08, 0, -0.05],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [-0.1, 0, -0.95],
            'UpperArm.R': [-0.1, 0, 0.95],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: 0.04,
          pose: {
            Torso: [0.06, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.05],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [-0.1, 0, -0.05],
            'LowerLeg.R': [0.25, 0, 0],
            'UpperArm.L': [-0.14, 0, -0.9],
            'UpperArm.R': [-0.14, 0, 0.9],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.04, 0, 0],
            'UpperLeg.L': [-0.16, 0, 0.05],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [-0.08, 0, -0.05],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [-0.1, 0, -0.95],
            'UpperArm.R': [-0.1, 0, 0.95],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightForward',
      1.2,
      [
        {
          time: 0,
          pose: {
            Torso: [-0.1, 0, 0],
            Head: [-0.25, 0, 0],
            'UpperLeg.L': [0.16, 0, 0.04],
            'LowerLeg.L': [0.22, 0, 0],
            'UpperLeg.R': [0.1, 0, -0.04],
            'LowerLeg.R': [0.16, 0, 0],
            'UpperArm.L': [0.55, 0, -1.0],
            'UpperArm.R': [0.55, 0, 1.0],
          },
        },
        {
          time: 1.2,
          pose: {
            Torso: [-0.1, 0, 0],
            Head: [-0.25, 0, 0],
            'UpperLeg.L': [0.16, 0, 0.04],
            'LowerLeg.L': [0.22, 0, 0],
            'UpperLeg.R': [0.1, 0, -0.04],
            'LowerLeg.R': [0.16, 0, 0],
            'UpperArm.L': [0.55, 0, -1.0],
            'UpperArm.R': [0.55, 0, 1.0],
          },
        },
      ],
      bindMap
    ),
  ];

  return clips;
}
