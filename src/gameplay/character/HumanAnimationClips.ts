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
    tracks.push(new THREE.QuaternionKeyframeTrack(`${info.bone.name}.quaternion`, times, values));
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
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsInfo.bone.name}.position`, times, posValues));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Builds complete, keyframed THREE.AnimationClips bound directly to the
 * loaded humanoid skeleton (supports Quaternius and Biped/Mixamo rigs).
 *
 * Important: `charDeltaQuat` applies rotations in character/world space to each
 * bone individually, so child bones (LowerArm, LowerLeg) inherit UpperArm/UpperLeg
 * world rotation automatically and only specify their own joint bend!
 */
export function buildAdventurerAnimationClips(scene: THREE.Object3D): THREE.AnimationClip[] {
  scene.updateMatrixWorld(true);

  const BIPED_ALIASES: Array<[RegExp, string]> = [
    [/^Bip001[\s_]+Pelvis(_\d+)?$/i, 'Hips'],
    [/^Bip001[\s_]+Spine(_\d+)?$/i, 'Torso'],
    [/^Bip001[\s_]+Spine2(_\d+)?$/i, 'Chest'],
    [/^Bip001[\s_]+Head(_\d+)?$/i, 'Head'],
    [/^Bip001[\s_]+L[\s_]+UpperArm(_\d+)?$/i, 'UpperArm.L'],
    [/^Bip001[\s_]+L[\s_]+Forearm(_\d+)?$/i, 'LowerArm.L'],
    [/^Bip001[\s_]+R[\s_]+UpperArm(_\d+)?$/i, 'UpperArm.R'],
    [/^Bip001[\s_]+R[\s_]+Forearm(_\d+)?$/i, 'LowerArm.R'],
    [/^Bip001[\s_]+L[\s_]+Thigh(_\d+)?$/i, 'UpperLeg.L'],
    [/^Bip001[\s_]+L[\s_]+Calf(_\d+)?$/i, 'LowerLeg.L'],
    [/^Bip001[\s_]+L[\s_]+Foot(_\d+)?$/i, 'Foot.L'],
    [/^Bip001[\s_]+R[\s_]+Thigh(_\d+)?$/i, 'UpperLeg.R'],
    [/^Bip001[\s_]+R[\s_]+Calf(_\d+)?$/i, 'LowerLeg.R'],
    [/^Bip001[\s_]+R[\s_]+Foot(_\d+)?$/i, 'Foot.R'],
  ];

  const bindMap = new Map<string, BoneBindInfo>();
  const worldScale = new THREE.Vector3();
  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      const worldQ = new THREE.Quaternion();
      bone.getWorldQuaternion(worldQ).normalize();
      bone.getWorldScale(worldScale);
      const restPos = bone.position.clone();
      const unitScale = worldScale.y > 0.001 ? 1 / worldScale.y : 1;
      const info: BoneBindInfo = {
        bone,
        bindLocalQuat: bone.quaternion.clone().normalize(),
        worldBindQuat: worldQ,
        worldBindQuatInv: worldQ.clone().invert(),
        hipsRestPos: restPos,
        hipsUnitScale: unitScale,
      };
      bindMap.set(bone.name, info);
      for (const [pattern, canonical] of BIPED_ALIASES) {
        if (pattern.test(bone.name) && !bindMap.has(canonical)) {
          bindMap.set(canonical, info);
        }
      }
    }
  });

  if (bindMap.size === 0) return [];

  // Arm-down angle from horizontal T-pose (~80 degrees down so arms hang naturally at sides)
  const armDown = 1.4;

  const clips: THREE.AnimationClip[] = [
    // 1. Relaxed Natural Anime Idle (arms hanging by sides with soft elbow bend & breathing)
    makePoseClip(
      'Idle',
      2.6,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, 0, 0],
            Chest: [-0.02, 0, 0],
            Head: [0.02, 0, 0],
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.05, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.05, 0, 0],
          },
        },
        {
          time: 1.3,
          hipsOffsetY: 0.015,
          pose: {
            Torso: [0.04, 0.03, 0],
            Chest: [0.02, 0, 0],
            Head: [-0.01, 0.04, 0],
            'UpperArm.L': [0.07, 0, -(armDown - 0.03)],
            'LowerArm.L': [-0.28, 0, 0],
            'UpperArm.R': [0.07, 0, armDown - 0.03],
            'LowerArm.R': [-0.28, 0, 0],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.05, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.05, 0, 0],
          },
        },
        {
          time: 2.6,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, 0, 0],
            Chest: [-0.02, 0, 0],
            Head: [0.02, 0, 0],
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.05, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.05, 0, 0],
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
          hipsOffsetY: -0.015,
          pose: {
            Hips: [0.04, 0.08, 0],
            Torso: [0.06, -0.08, 0],
            'UpperLeg.L': [-0.48, 0, 0.02],
            'LowerLeg.L': [0.16, 0, 0],
            'Foot.L': [-0.1, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.24, 0, 0],
            'Foot.R': [0.18, 0, 0],
            'UpperArm.L': [0.36, 0, -armDown],
            'LowerArm.L': [-0.26, 0, 0],
            'UpperArm.R': [-0.36, 0, armDown],
            'LowerArm.R': [-0.42, 0, 0],
          },
        },
        {
          time: 0.2,
          hipsOffsetY: 0.025,
          pose: {
            Hips: [0.04, 0, 0.02],
            Torso: [0.06, 0, 0],
            'UpperLeg.L': [-0.06, 0, 0.02],
            'LowerLeg.L': [0.08, 0, 0],
            'Foot.L': [0, 0, 0],
            'UpperLeg.R': [-0.2, 0, -0.02],
            'LowerLeg.R': [0.72, 0, 0],
            'Foot.R': [-0.14, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.28, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.28, 0, 0],
          },
        },
        {
          time: 0.4,
          hipsOffsetY: -0.015,
          pose: {
            Hips: [0.04, -0.08, 0],
            Torso: [0.06, 0.08, 0],
            'UpperLeg.L': [0.42, 0, 0.02],
            'LowerLeg.L': [0.24, 0, 0],
            'Foot.L': [0.18, 0, 0],
            'UpperLeg.R': [-0.48, 0, -0.02],
            'LowerLeg.R': [0.16, 0, 0],
            'Foot.R': [-0.1, 0, 0],
            'UpperArm.L': [-0.36, 0, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0.36, 0, armDown],
            'LowerArm.R': [-0.26, 0, 0],
          },
        },
        {
          time: 0.6,
          hipsOffsetY: 0.025,
          pose: {
            Hips: [0.04, 0, -0.02],
            Torso: [0.06, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.02],
            'LowerLeg.L': [0.72, 0, 0],
            'Foot.L': [-0.14, 0, 0],
            'UpperLeg.R': [-0.06, 0, -0.02],
            'LowerLeg.R': [0.08, 0, 0],
            'Foot.R': [0, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.28, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.28, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.015,
          pose: {
            Hips: [0.04, 0.08, 0],
            Torso: [0.06, -0.08, 0],
            'UpperLeg.L': [-0.48, 0, 0.02],
            'LowerLeg.L': [0.16, 0, 0],
            'Foot.L': [-0.1, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.24, 0, 0],
            'Foot.R': [0.18, 0, 0],
            'UpperArm.L': [0.36, 0, -armDown],
            'LowerArm.L': [-0.26, 0, 0],
            'UpperArm.R': [-0.36, 0, armDown],
            'LowerArm.R': [-0.42, 0, 0],
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
            'LowerArm.L': [-0.92, 0, 0],
            'UpperArm.R': [-0.68, 0, armDown],
            'LowerArm.R': [-1.1, 0, 0],
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
            'LowerArm.L': [-0.95, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.95, 0, 0],
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
            'LowerArm.L': [-1.1, 0, 0],
            'UpperArm.R': [0.68, 0, armDown],
            'LowerArm.R': [-0.92, 0, 0],
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
            'LowerArm.L': [-0.95, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.95, 0, 0],
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
            'LowerArm.L': [-0.92, 0, 0],
            'UpperArm.R': [-0.68, 0, armDown],
            'LowerArm.R': [-1.1, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 4. Strafe Left & Strafe Right Cycles (0.68s)
    makePoseClip(
      'StrafeLeft',
      0.68,
      [
        {
          time: 0,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, 0.12, 0.06],
            'UpperLeg.L': [-0.18, 0, 0.36],
            'LowerLeg.L': [0.24, 0, 0],
            'UpperLeg.R': [0.1, 0, -0.12],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [-0.15, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [0.12, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
        {
          time: 0.34,
          hipsOffsetY: 0.02,
          pose: {
            Torso: [0.06, -0.06, -0.04],
            'UpperLeg.L': [0.08, 0, 0.06],
            'LowerLeg.L': [0.22, 0, 0],
            'UpperLeg.R': [-0.16, 0, -0.3],
            'LowerLeg.R': [0.36, 0, 0],
            'UpperArm.L': [0.12, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.15, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
        {
          time: 0.68,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, 0.12, 0.06],
            'UpperLeg.L': [-0.18, 0, 0.36],
            'LowerLeg.L': [0.24, 0, 0],
            'UpperLeg.R': [0.1, 0, -0.12],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [-0.15, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [0.12, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'StrafeRight',
      0.68,
      [
        {
          time: 0,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, -0.12, -0.06],
            'UpperLeg.R': [-0.18, 0, -0.36],
            'LowerLeg.R': [0.24, 0, 0],
            'UpperLeg.L': [0.1, 0, 0.12],
            'LowerLeg.L': [0.28, 0, 0],
            'UpperArm.L': [0.12, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.15, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
        {
          time: 0.34,
          hipsOffsetY: 0.02,
          pose: {
            Torso: [0.06, 0.06, 0.04],
            'UpperLeg.R': [0.08, 0, -0.06],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperLeg.L': [-0.16, 0, 0.3],
            'LowerLeg.L': [0.36, 0, 0],
            'UpperArm.L': [-0.15, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [0.12, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
        {
          time: 0.68,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, -0.12, -0.06],
            'UpperLeg.R': [-0.18, 0, -0.36],
            'LowerLeg.R': [0.24, 0, 0],
            'UpperLeg.L': [0.1, 0, 0.12],
            'LowerLeg.L': [0.28, 0, 0],
            'UpperArm.L': [0.12, 0, -armDown],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.15, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 5. Weapon-gated CombatIdle
    makePoseClip(
      'CombatIdle',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.08, 0.15, 0],
            'UpperArm.L': [-0.25, 0.18, -(armDown - 0.12)],
            'LowerArm.L': [-0.65, 0, 0],
            'UpperArm.R': [-0.5, -0.18, armDown - 0.15],
            'LowerArm.R': [-0.75, 0.15, 0],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.025,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.1, 0.17, 0],
            'UpperArm.L': [-0.28, 0.18, -(armDown - 0.12)],
            'LowerArm.L': [-0.68, 0, 0],
            'UpperArm.R': [-0.54, -0.18, armDown - 0.15],
            'LowerArm.R': [-0.78, 0.15, 0],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.08, 0.15, 0],
            'UpperArm.L': [-0.25, 0.18, -(armDown - 0.12)],
            'LowerArm.L': [-0.65, 0, 0],
            'UpperArm.R': [-0.5, -0.18, armDown - 0.15],
            'LowerArm.R': [-0.75, 0.15, 0],
            'UpperLeg.L': [-0.24, 0.1, 0.08],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.18, -0.1, -0.08],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 6. JumpStart / JumpLoop / Fall / Land
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
            'LowerArm.L': [-0.3, 0, 0],
            'UpperArm.R': [0.25, 0, armDown],
            'LowerArm.R': [-0.3, 0, 0],
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
            'UpperArm.L': [-0.55, 0, -1.1],
            'LowerArm.L': [-0.55, 0, 0],
            'UpperArm.R': [-0.55, 0, 1.1],
            'LowerArm.R': [-0.55, 0, 0],
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
            'UpperArm.L': [-0.42, 0, -1.15],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.42, 0, 1.15],
            'LowerArm.R': [-0.45, 0, 0],
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
            'UpperArm.L': [-0.42, 0, -1.15],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.42, 0, 1.15],
            'LowerArm.R': [-0.45, 0, 0],
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
            'UpperArm.L': [-0.25, 0, -1.05],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.25, 0, 1.05],
            'LowerArm.R': [-0.45, 0, 0],
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
            'UpperArm.L': [-0.25, 0, -1.05],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [-0.25, 0, 1.05],
            'LowerArm.R': [-0.45, 0, 0],
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
            'LowerArm.L': [-0.35, 0, 0],
            'UpperArm.R': [0.15, 0, armDown],
            'LowerArm.R': [-0.35, 0, 0],
          },
        },
        {
          time: 0.18,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 7. Sword Attack, Block, Dodge, HitReaction, Death
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
            'UpperArm.R': [-0.9, -0.5, armDown - 0.3],
            'LowerArm.R': [-0.55, 0, 0],
            'UpperArm.L': [-0.25, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
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
            'UpperArm.R': [-1.15, -0.65, armDown - 0.35],
            'LowerArm.R': [-0.45, 0, 0],
            'UpperArm.L': [-0.2, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
        {
          time: 0.26,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.25, 0],
            Chest: [0.14, 0.45, 0],
            'UpperArm.R': [-0.55, 0.75, armDown - 0.25],
            'LowerArm.R': [-0.25, 0, 0],
            'UpperArm.L': [-0.15, 0, -armDown],
            'LowerArm.L': [-0.35, 0, 0],
          },
        },
        {
          time: 0.42,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.1, 0],
            Chest: [0.08, 0.18, 0],
            'UpperArm.R': [-0.65, 0.2, armDown - 0.2],
            'LowerArm.R': [-0.65, 0, 0],
            'UpperArm.L': [-0.25, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
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
            'UpperArm.R': [-0.95, 0.45, armDown - 0.3],
            'LowerArm.R': [-1.05, -0.35, 0],
            'UpperArm.L': [-0.55, -0.2, -(armDown - 0.2)],
            'LowerArm.L': [-0.8, 0, 0],
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
            'UpperArm.R': [-0.95, 0.45, armDown - 0.3],
            'LowerArm.R': [-1.05, -0.35, 0],
            'UpperArm.L': [-0.55, -0.2, -(armDown - 0.2)],
            'LowerArm.L': [-0.8, 0, 0],
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
            'LowerArm.L': [-0.45, 0, 0],
            'UpperArm.R': [0.42, 0, armDown],
            'LowerArm.R': [-0.45, 0, 0],
          },
        },
        {
          time: 0.36,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.08, 0, 0],
            Chest: [0.1, 0, 0],
            'UpperArm.L': [0.1, 0, -armDown],
            'LowerArm.L': [-0.25, 0, 0],
            'UpperArm.R': [0.1, 0, armDown],
            'LowerArm.R': [-0.25, 0, 0],
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
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
          },
        },
        {
          time: 0.14,
          hipsOffsetY: -0.04,
          pose: {
            Torso: [-0.28, 0, 0],
            Head: [-0.32, 0, 0],
            'UpperArm.L': [-0.25, 0, -1.2],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.25, 0, 1.2],
            'LowerArm.R': [-0.5, 0, 0],
          },
        },
        {
          time: 0.35,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.04, 0, -armDown],
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
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
            'LowerArm.L': [-0.22, 0, 0],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.22, 0, 0],
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
            'UpperArm.L': [-0.4, 0, -1.0],
            'UpperArm.R': [-0.4, 0, 1.0],
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
            'UpperArm.L': [-0.35, 0, -0.8],
            'UpperArm.R': [-0.35, 0, 0.8],
          },
        },
      ],
      bindMap
    ),

    // 8. Magical Anime Flight Clips (Hover, Forward, Ascend, Descend — no stiff A-pose!)
    makePoseClip(
      'FlightHover',
      1.8,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.05, 0, 0],
            Head: [0.04, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.03],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [-0.08, 0, -0.03],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0.16, 0, -(armDown - 0.12)],
            'LowerArm.L': [-0.36, 0, 0],
            'UpperArm.R': [0.16, 0, armDown - 0.12],
            'LowerArm.R': [-0.36, 0, 0],
          },
        },
        {
          time: 0.9,
          hipsOffsetY: 0.05,
          pose: {
            Torso: [0.08, 0.03, 0],
            Head: [0.02, 0, 0],
            'UpperLeg.L': [-0.26, 0, 0.03],
            'LowerLeg.L': [0.48, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.03],
            'LowerLeg.R': [0.26, 0, 0],
            'UpperArm.L': [0.22, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0.22, 0, armDown - 0.08],
            'LowerArm.R': [-0.42, 0, 0],
          },
        },
        {
          time: 1.8,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.05, 0, 0],
            Head: [0.04, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.03],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [-0.08, 0, -0.03],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0.16, 0, -(armDown - 0.12)],
            'LowerArm.L': [-0.36, 0, 0],
            'UpperArm.R': [0.16, 0, armDown - 0.12],
            'LowerArm.R': [-0.36, 0, 0],
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
            Torso: [-0.08, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [0.18, 0, 0.03],
            'LowerLeg.L': [0.26, 0, 0],
            'UpperLeg.R': [0.08, 0, -0.03],
            'LowerLeg.R': [0.18, 0, 0],
            'UpperArm.L': [0.58, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.28, 0, 0],
            'UpperArm.R': [0.58, 0, armDown - 0.08],
            'LowerArm.R': [-0.28, 0, 0],
          },
        },
        {
          time: 0.6,
          hipsOffsetY: 0.025,
          pose: {
            Torso: [-0.05, 0, 0],
            Head: [-0.26, 0, 0],
            'UpperLeg.L': [0.12, 0, 0.03],
            'LowerLeg.L': [0.32, 0, 0],
            'UpperLeg.R': [0.16, 0, -0.03],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0.64, 0, -(armDown - 0.06)],
            'LowerArm.L': [-0.32, 0, 0],
            'UpperArm.R': [0.64, 0, armDown - 0.06],
            'LowerArm.R': [-0.32, 0, 0],
          },
        },
        {
          time: 1.2,
          pose: {
            Torso: [-0.08, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [0.18, 0, 0.03],
            'LowerLeg.L': [0.26, 0, 0],
            'UpperLeg.R': [0.08, 0, -0.03],
            'LowerLeg.R': [0.18, 0, 0],
            'UpperArm.L': [0.58, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.28, 0, 0],
            'UpperArm.R': [0.58, 0, armDown - 0.08],
            'LowerArm.R': [-0.28, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightAscend',
      1.0,
      [
        {
          time: 0,
          pose: {
            Torso: [-0.14, 0, 0],
            Head: [-0.18, 0, 0],
            'UpperLeg.L': [-0.34, 0, 0.04],
            'LowerLeg.L': [0.62, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.04],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [0.35, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.4, 0, 0],
            'UpperArm.R': [0.35, 0, armDown - 0.1],
            'LowerArm.R': [-0.4, 0, 0],
          },
        },
        {
          time: 1.0,
          pose: {
            Torso: [-0.14, 0, 0],
            Head: [-0.18, 0, 0],
            'UpperLeg.L': [-0.34, 0, 0.04],
            'LowerLeg.L': [0.62, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.04],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [0.35, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.4, 0, 0],
            'UpperArm.R': [0.35, 0, armDown - 0.1],
            'LowerArm.R': [-0.4, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightDescend',
      1.0,
      [
        {
          time: 0,
          pose: {
            Torso: [0.12, 0, 0],
            Head: [0.1, 0, 0],
            'UpperLeg.L': [-0.15, 0, 0.04],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.25, 0, -0.04],
            'LowerLeg.R': [0.46, 0, 0],
            'UpperArm.L': [-0.15, 0, -(armDown - 0.15)],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [-0.15, 0, armDown - 0.15],
            'LowerArm.R': [-0.48, 0, 0],
          },
        },
        {
          time: 1.0,
          pose: {
            Torso: [0.12, 0, 0],
            Head: [0.1, 0, 0],
            'UpperLeg.L': [-0.15, 0, 0.04],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.25, 0, -0.04],
            'LowerLeg.R': [0.46, 0, 0],
            'UpperArm.L': [-0.15, 0, -(armDown - 0.15)],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [-0.15, 0, armDown - 0.15],
            'LowerArm.R': [-0.48, 0, 0],
          },
        },
      ],
      bindMap
    ),
  ];

  return clips;
}
