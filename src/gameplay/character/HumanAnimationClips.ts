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
    [/^Bip001[\s_]+L[\s_]+Hand(_\d+)?$/i, 'Hand.L'],
    [/^Bip001[\s_]+R[\s_]+UpperArm(_\d+)?$/i, 'UpperArm.R'],
    [/^Bip001[\s_]+R[\s_]+Forearm(_\d+)?$/i, 'LowerArm.R'],
    [/^Bip001[\s_]+R[\s_]+Hand(_\d+)?$/i, 'Hand.R'],
    [/^Bip001[\s_]+L[\s_]+Thigh(_\d+)?$/i, 'UpperLeg.L'],
    [/^Bip001[\s_]+L[\s_]+Calf(_\d+)?$/i, 'LowerLeg.L'],
    [/^Bip001[\s_]+L[\s_]+Foot(_\d+)?$/i, 'Foot.L'],
    [/^Bip001[\s_]+R[\s_]+Thigh(_\d+)?$/i, 'UpperLeg.R'],
    [/^Bip001[\s_]+R[\s_]+Calf(_\d+)?$/i, 'LowerLeg.R'],
    [/^Bip001[\s_]+R[\s_]+Foot(_\d+)?$/i, 'Foot.R'],
    [/^Bip001[\s_]+Xtra[\s_]+Coat[\s_]+R02[\s_]+001(_\d+)?$/i, 'CoatSide.R'],
    [/^Bip001[\s_]+Xtra[\s_]+Coat[\s_]+R02[\s_]+001Opp(_\d+)?$/i, 'CoatSide.L'],
    [/^Bip001[\s_]+Xtra[\s_]+Coat[\s_]+R03[\s_]+001(_\d+)?$/i, 'CoatBack.R'],
    [/^Bip001[\s_]+Xtra[\s_]+Coat[\s_]+R03[\s_]+001Opp(_\d+)?$/i, 'CoatBack.L'],
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
    // 1. Natural Breathing & Weight-Shift Anime Idle
    makePoseClip(
      'Idle',
      2.4,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, -0.02, 0],
            Chest: [-0.02, 0, 0],
            Head: [0.02, -0.03, 0],
            'UpperArm.L': [0.05, 0, -armDown],
            'LowerArm.L': [-0.26, 0, 0],
            'UpperArm.R': [0.05, 0, armDown],
            'LowerArm.R': [-0.26, 0, 0],
            'UpperLeg.L': [-0.03, 0, 0.03],
            'LowerLeg.L': [0.06, 0, 0],
            'UpperLeg.R': [0.03, 0, -0.03],
            'LowerLeg.R': [0.06, 0, 0],
            'CoatBack.L': [0.06, 0, 0],
            'CoatBack.R': [0.06, 0, 0],
          },
        },
        {
          time: 1.2,
          hipsOffsetY: 0.018,
          pose: {
            Torso: [0.05, 0.04, 0],
            Chest: [0.03, 0.02, 0],
            Head: [-0.02, 0.06, 0],
            'UpperArm.L': [0.1, 0, -(armDown - 0.04)],
            'LowerArm.L': [-0.36, 0, 0],
            'UpperArm.R': [0.1, 0, armDown - 0.04],
            'LowerArm.R': [-0.36, 0, 0],
            'UpperLeg.L': [-0.03, 0, 0.03],
            'LowerLeg.L': [0.06, 0, 0],
            'UpperLeg.R': [0.03, 0, -0.03],
            'LowerLeg.R': [0.06, 0, 0],
            'CoatBack.L': [0.12, 0, 0],
            'CoatBack.R': [0.12, 0, 0],
          },
        },
        {
          time: 2.4,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.02, -0.02, 0],
            Chest: [-0.02, 0, 0],
            Head: [0.02, -0.03, 0],
            'UpperArm.L': [0.05, 0, -armDown],
            'LowerArm.L': [-0.26, 0, 0],
            'UpperArm.R': [0.05, 0, armDown],
            'LowerArm.R': [-0.26, 0, 0],
            'UpperLeg.L': [-0.03, 0, 0.03],
            'LowerLeg.L': [0.06, 0, 0],
            'UpperLeg.R': [0.03, 0, -0.03],
            'LowerLeg.R': [0.06, 0, 0],
            'CoatBack.L': [0.06, 0, 0],
            'CoatBack.R': [0.06, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 2. Expressive Bipedal Walk Cycle (0.78s loop)
    makePoseClip(
      'Walk',
      0.78,
      [
        {
          time: 0,
          hipsOffsetY: -0.02,
          pose: {
            Hips: [0.05, 0.12, 0],
            Torso: [0.08, -0.12, 0],
            'UpperLeg.L': [-0.64, 0, 0.02],
            'LowerLeg.L': [0.22, 0, 0],
            'Foot.L': [-0.14, 0, 0],
            'UpperLeg.R': [0.56, 0, -0.02],
            'LowerLeg.R': [0.32, 0, 0],
            'Foot.R': [0.24, 0, 0],
            'UpperArm.L': [0.56, 0, -armDown],
            'LowerArm.L': [-0.25, 0, 0],
            'UpperArm.R': [-0.54, 0, armDown],
            'LowerArm.R': [-0.68, 0, 0],
            'CoatBack.L': [0.32, 0, 0.04],
            'CoatBack.R': [0.24, 0, -0.04],
            'CoatSide.L': [0.18, 0, 0.05],
            'CoatSide.R': [0.24, 0, -0.05],
          },
        },
        {
          time: 0.195,
          hipsOffsetY: 0.032,
          pose: {
            Hips: [0.05, 0, 0.03],
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.08, 0, 0.02],
            'LowerLeg.L': [0.1, 0, 0],
            'Foot.L': [0, 0, 0],
            'UpperLeg.R': [-0.32, 0, -0.02],
            'LowerLeg.R': [0.92, 0, 0],
            'Foot.R': [-0.18, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.42, 0, 0],
            'CoatBack.L': [0.28, 0, -0.03],
            'CoatBack.R': [0.3, 0, 0.03],
            'CoatSide.L': [0.14, 0, 0.04],
            'CoatSide.R': [0.14, 0, -0.04],
          },
        },
        {
          time: 0.39,
          hipsOffsetY: -0.02,
          pose: {
            Hips: [0.05, -0.12, 0],
            Torso: [0.08, 0.12, 0],
            'UpperLeg.L': [0.56, 0, 0.02],
            'LowerLeg.L': [0.32, 0, 0],
            'Foot.L': [0.24, 0, 0],
            'UpperLeg.R': [-0.64, 0, -0.02],
            'LowerLeg.R': [0.22, 0, 0],
            'Foot.R': [-0.14, 0, 0],
            'UpperArm.L': [-0.54, 0, -armDown],
            'LowerArm.L': [-0.68, 0, 0],
            'UpperArm.R': [0.56, 0, armDown],
            'LowerArm.R': [-0.25, 0, 0],
            'CoatBack.L': [0.24, 0, -0.04],
            'CoatBack.R': [0.32, 0, 0.04],
            'CoatSide.L': [0.24, 0, 0.05],
            'CoatSide.R': [0.18, 0, -0.05],
          },
        },
        {
          time: 0.585,
          hipsOffsetY: 0.032,
          pose: {
            Hips: [0.05, 0, -0.03],
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.32, 0, 0.02],
            'LowerLeg.L': [0.92, 0, 0],
            'Foot.L': [-0.18, 0, 0],
            'UpperLeg.R': [-0.08, 0, -0.02],
            'LowerLeg.R': [0.1, 0, 0],
            'Foot.R': [0, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-0.42, 0, 0],
            'CoatBack.L': [0.3, 0, 0.03],
            'CoatBack.R': [0.28, 0, -0.03],
            'CoatSide.L': [0.14, 0, 0.04],
            'CoatSide.R': [0.14, 0, -0.04],
          },
        },
        {
          time: 0.78,
          hipsOffsetY: -0.02,
          pose: {
            Hips: [0.05, 0.12, 0],
            Torso: [0.08, -0.12, 0],
            'UpperLeg.L': [-0.64, 0, 0.02],
            'LowerLeg.L': [0.22, 0, 0],
            'Foot.L': [-0.14, 0, 0],
            'UpperLeg.R': [0.56, 0, -0.02],
            'LowerLeg.R': [0.32, 0, 0],
            'Foot.R': [0.24, 0, 0],
            'UpperArm.L': [0.56, 0, -armDown],
            'LowerArm.L': [-0.25, 0, 0],
            'UpperArm.R': [-0.54, 0, armDown],
            'LowerArm.R': [-0.68, 0, 0],
            'CoatBack.L': [0.32, 0, 0.04],
            'CoatBack.R': [0.24, 0, -0.04],
            'CoatSide.L': [0.18, 0, 0.05],
            'CoatSide.R': [0.24, 0, -0.05],
          },
        },
      ],
      bindMap
    ),

    // 3. Athletic Anime Sprint Cycle (0.54s loop)
    makePoseClip(
      'Run',
      0.54,
      [
        {
          time: 0,
          hipsOffsetY: -0.035,
          pose: {
            Hips: [0.14, 0.15, 0],
            Torso: [0.22, -0.18, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.9, 0, 0.02],
            'LowerLeg.L': [0.38, 0, 0],
            'Foot.L': [-0.18, 0, 0],
            'UpperLeg.R': [0.78, 0, -0.02],
            'LowerLeg.R': [0.52, 0, 0],
            'Foot.R': [0.34, 0, 0],
            'UpperArm.L': [0.82, 0, -armDown],
            'LowerArm.L': [-0.95, 0, 0],
            'UpperArm.R': [-0.82, 0, armDown],
            'LowerArm.R': [-1.22, 0, 0],
            'CoatBack.L': [0.58, 0, 0.06],
            'CoatBack.R': [0.5, 0, -0.06],
            'CoatSide.L': [0.38, 0, 0.1],
            'CoatSide.R': [0.42, 0, -0.1],
          },
        },
        {
          time: 0.135,
          hipsOffsetY: 0.045,
          pose: {
            Hips: [0.14, 0, 0],
            Torso: [0.22, 0, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.12, 0, 0.02],
            'LowerLeg.L': [0.22, 0, 0],
            'UpperLeg.R': [-0.52, 0, -0.02],
            'LowerLeg.R': [1.34, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-1.05, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-1.05, 0, 0],
            'CoatBack.L': [0.64, 0, -0.04],
            'CoatBack.R': [0.64, 0, 0.04],
            'CoatSide.L': [0.36, 0, 0.08],
            'CoatSide.R': [0.36, 0, -0.08],
          },
        },
        {
          time: 0.27,
          hipsOffsetY: -0.035,
          pose: {
            Hips: [0.14, -0.15, 0],
            Torso: [0.22, 0.18, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [0.78, 0, 0.02],
            'LowerLeg.L': [0.52, 0, 0],
            'Foot.L': [0.34, 0, 0],
            'UpperLeg.R': [-0.9, 0, -0.02],
            'LowerLeg.R': [0.38, 0, 0],
            'Foot.R': [-0.18, 0, 0],
            'UpperArm.L': [-0.82, 0, -armDown],
            'LowerArm.L': [-1.22, 0, 0],
            'UpperArm.R': [0.82, 0, armDown],
            'LowerArm.R': [-0.95, 0, 0],
            'CoatBack.L': [0.5, 0, -0.06],
            'CoatBack.R': [0.58, 0, 0.06],
            'CoatSide.L': [0.42, 0, 0.1],
            'CoatSide.R': [0.38, 0, -0.1],
          },
        },
        {
          time: 0.405,
          hipsOffsetY: 0.045,
          pose: {
            Hips: [0.14, 0, 0],
            Torso: [0.22, 0, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.52, 0, 0.02],
            'LowerLeg.L': [1.34, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.02],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0, 0, -armDown],
            'LowerArm.L': [-1.05, 0, 0],
            'UpperArm.R': [0, 0, armDown],
            'LowerArm.R': [-1.05, 0, 0],
            'CoatBack.L': [0.64, 0, 0.04],
            'CoatBack.R': [0.64, 0, -0.04],
            'CoatSide.L': [0.36, 0, 0.08],
            'CoatSide.R': [0.36, 0, -0.08],
          },
        },
        {
          time: 0.54,
          hipsOffsetY: -0.035,
          pose: {
            Hips: [0.14, 0.15, 0],
            Torso: [0.22, -0.18, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.9, 0, 0.02],
            'LowerLeg.L': [0.38, 0, 0],
            'Foot.L': [-0.18, 0, 0],
            'UpperLeg.R': [0.78, 0, -0.02],
            'LowerLeg.R': [0.52, 0, 0],
            'Foot.R': [0.34, 0, 0],
            'UpperArm.L': [0.82, 0, -armDown],
            'LowerArm.L': [-0.95, 0, 0],
            'UpperArm.R': [-0.82, 0, armDown],
            'LowerArm.R': [-1.22, 0, 0],
            'CoatBack.L': [0.58, 0, 0.06],
            'CoatBack.R': [0.5, 0, -0.06],
            'CoatSide.L': [0.38, 0, 0.1],
            'CoatSide.R': [0.42, 0, -0.1],
          },
        },
      ],
      bindMap
    ),

    // 4. Strafe Left & Strafe Right Cycles (0.64s)
    makePoseClip(
      'StrafeLeft',
      0.64,
      [
        {
          time: 0,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, 0.14, 0.06],
            'UpperLeg.L': [-0.22, 0, 0.42],
            'LowerLeg.L': [0.28, 0, 0],
            'UpperLeg.R': [0.12, 0, -0.14],
            'LowerLeg.R': [0.32, 0, 0],
            'UpperArm.L': [-0.22, 0, -armDown],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [0.18, 0, armDown],
            'LowerArm.R': [-0.5, 0, 0],
          },
        },
        {
          time: 0.32,
          hipsOffsetY: 0.025,
          pose: {
            Torso: [0.06, -0.08, -0.05],
            'UpperLeg.L': [0.1, 0, 0.06],
            'LowerLeg.L': [0.24, 0, 0],
            'UpperLeg.R': [-0.2, 0, -0.34],
            'LowerLeg.R': [0.42, 0, 0],
            'UpperArm.L': [0.18, 0, -armDown],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [-0.22, 0, armDown],
            'LowerArm.R': [-0.48, 0, 0],
          },
        },
        {
          time: 0.64,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, 0.14, 0.06],
            'UpperLeg.L': [-0.22, 0, 0.42],
            'LowerLeg.L': [0.28, 0, 0],
            'UpperLeg.R': [0.12, 0, -0.14],
            'LowerLeg.R': [0.32, 0, 0],
            'UpperArm.L': [-0.22, 0, -armDown],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [0.18, 0, armDown],
            'LowerArm.R': [-0.5, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'StrafeRight',
      0.64,
      [
        {
          time: 0,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, -0.14, -0.06],
            'UpperLeg.R': [-0.22, 0, -0.42],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperLeg.L': [0.12, 0, 0.14],
            'LowerLeg.L': [0.32, 0, 0],
            'UpperArm.L': [0.18, 0, -armDown],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.22, 0, armDown],
            'LowerArm.R': [-0.5, 0, 0],
          },
        },
        {
          time: 0.32,
          hipsOffsetY: 0.025,
          pose: {
            Torso: [0.06, 0.08, 0.05],
            'UpperLeg.R': [0.1, 0, -0.06],
            'LowerLeg.R': [0.24, 0, 0],
            'UpperLeg.L': [-0.2, 0, 0.34],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperArm.L': [-0.22, 0, -armDown],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [0.18, 0, armDown],
            'LowerArm.R': [-0.48, 0, 0],
          },
        },
        {
          time: 0.64,
          hipsOffsetY: -0.02,
          pose: {
            Torso: [0.06, -0.14, -0.06],
            'UpperLeg.R': [-0.22, 0, -0.42],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperLeg.L': [0.12, 0, 0.14],
            'LowerLeg.L': [0.32, 0, 0],
            'UpperArm.L': [0.18, 0, -armDown],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.22, 0, armDown],
            'LowerArm.R': [-0.5, 0, 0],
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
          hipsOffsetY: -0.02,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.12, 0.19, 0],
            'UpperArm.L': [-0.32, 0.2, -(armDown - 0.12)],
            'LowerArm.L': [-0.75, 0, 0],
            'UpperArm.R': [-0.58, -0.2, armDown - 0.15],
            'LowerArm.R': [-0.85, 0.15, 0],
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
            Torso: [0.18, 0, 0],
            'UpperLeg.L': [-0.52, 0, 0.04],
            'LowerLeg.L': [0.85, 0, 0],
            'UpperLeg.R': [-0.52, 0, -0.04],
            'LowerLeg.R': [0.85, 0, 0],
            'UpperArm.L': [0.32, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
            'UpperArm.R': [0.32, 0, armDown],
            'LowerArm.R': [-0.4, 0, 0],
          },
        },
        {
          time: 0.22,
          hipsOffsetY: 0.03,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.65, 0, 0.05],
            'LowerLeg.L': [0.95, 0, 0],
            'UpperLeg.R': [-0.15, 0, -0.05],
            'LowerLeg.R': [0.42, 0, 0],
            'UpperArm.L': [-0.65, 0, -1.12],
            'LowerArm.L': [-0.6, 0, 0],
            'UpperArm.R': [-0.65, 0, 1.12],
            'LowerArm.R': [-0.6, 0, 0],
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
            'UpperLeg.L': [-0.52, 0, 0.05],
            'LowerLeg.L': [0.85, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.05],
            'LowerLeg.R': [0.4, 0, 0],
            'UpperArm.L': [-0.48, 0, -1.16],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.48, 0, 1.16],
            'LowerArm.R': [-0.5, 0, 0],
            'CoatBack.L': [0.5, 0, 0],
            'CoatBack.R': [0.5, 0, 0],
          },
        },
        {
          time: 0.4,
          pose: {
            Torso: [0.1, 0, 0],
            'UpperLeg.L': [-0.44, 0, 0.05],
            'LowerLeg.L': [0.74, 0, 0],
            'UpperLeg.R': [-0.26, 0, -0.05],
            'LowerLeg.R': [0.52, 0, 0],
            'UpperArm.L': [-0.36, 0, -1.12],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [-0.36, 0, 1.12],
            'LowerArm.R': [-0.42, 0, 0],
            'CoatBack.L': [0.65, 0, 0],
            'CoatBack.R': [0.65, 0, 0],
          },
        },
        {
          time: 0.8,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.52, 0, 0.05],
            'LowerLeg.L': [0.85, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.05],
            'LowerLeg.R': [0.4, 0, 0],
            'UpperArm.L': [-0.48, 0, -1.16],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.48, 0, 1.16],
            'LowerArm.R': [-0.5, 0, 0],
            'CoatBack.L': [0.5, 0, 0],
            'CoatBack.R': [0.5, 0, 0],
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
            'UpperLeg.L': [-0.3, 0, 0.05],
            'LowerLeg.L': [0.52, 0, 0],
            'UpperLeg.R': [-0.14, 0, -0.05],
            'LowerLeg.R': [0.34, 0, 0],
            'UpperArm.L': [-0.28, 0, -1.06],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.28, 0, 1.06],
            'LowerArm.R': [-0.5, 0, 0],
            'CoatBack.L': [0.75, 0, 0],
            'CoatBack.R': [0.75, 0, 0],
          },
        },
        {
          time: 0.4,
          pose: {
            Torso: [0.08, 0, 0],
            'UpperLeg.L': [-0.22, 0, 0.05],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [-0.24, 0, -0.05],
            'LowerLeg.R': [0.48, 0, 0],
            'UpperArm.L': [-0.38, 0, -1.0],
            'LowerArm.L': [-0.58, 0, 0],
            'UpperArm.R': [-0.38, 0, 1.0],
            'LowerArm.R': [-0.58, 0, 0],
            'CoatBack.L': [0.88, 0, 0],
            'CoatBack.R': [0.88, 0, 0],
          },
        },
        {
          time: 0.8,
          pose: {
            Torso: [0.05, 0, 0],
            'UpperLeg.L': [-0.3, 0, 0.05],
            'LowerLeg.L': [0.52, 0, 0],
            'UpperLeg.R': [-0.14, 0, -0.05],
            'LowerLeg.R': [0.34, 0, 0],
            'UpperArm.L': [-0.28, 0, -1.06],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperArm.R': [-0.28, 0, 1.06],
            'LowerArm.R': [-0.5, 0, 0],
            'CoatBack.L': [0.75, 0, 0],
            'CoatBack.R': [0.75, 0, 0],
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
            'UpperArm.L': [0.18, 0, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0.18, 0, armDown],
            'LowerArm.R': [-0.42, 0, 0],
          },
        },
        {
          time: 0.18,
          hipsOffsetY: 0,
          pose: {
            'UpperArm.L': [0.05, 0, -armDown],
            'LowerArm.L': [-0.26, 0, 0],
            'UpperArm.R': [0.05, 0, armDown],
            'LowerArm.R': [-0.26, 0, 0],
          },
        },
      ],
      bindMap
    ),

    // 7. Three-Hit Sword Combo (Attack1, Attack2, Attack3 + Attack alias), Block, Dodge, HitReaction, Death
    makePoseClip(
      'Attack1',
      0.38,
      [
        {
          time: 0,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.06, -0.25, 0],
            Chest: [0.08, -0.35, 0],
            'UpperArm.R': [-0.95, -0.55, armDown - 0.35],
            'LowerArm.R': [-0.55, 0, 0],
            'UpperArm.L': [-0.25, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
            'UpperLeg.L': [-0.28, 0, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [0.22, 0, -0.06],
            'LowerLeg.R': [0.28, 0, 0],
          },
        },
        {
          time: 0.09,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.34, 0],
            Torso: [0.08, -0.35, 0],
            Chest: [0.12, -0.5, 0],
            'UpperArm.R': [-1.25, -0.7, armDown - 0.4],
            'LowerArm.R': [-0.45, 0, 0],
            'UpperArm.L': [-0.2, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
        {
          time: 0.23,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.28, 0],
            Torso: [0.1, 0.32, 0],
            Chest: [0.15, 0.52, 0],
            'UpperArm.R': [-0.5, 0.85, armDown - 0.25],
            'LowerArm.R': [-0.25, 0, 0],
            'UpperArm.L': [-0.15, 0, -armDown],
            'LowerArm.L': [-0.35, 0, 0],
          },
        },
        {
          time: 0.38,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.14, 0],
            Chest: [0.08, 0.22, 0],
            'UpperArm.R': [-0.62, 0.35, armDown - 0.22],
            'LowerArm.R': [-0.6, 0, 0],
            'UpperArm.L': [-0.25, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Attack2',
      0.4,
      [
        {
          time: 0,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.26, 0],
            Torso: [0.08, 0.35, 0],
            Chest: [0.1, 0.5, 0],
            'UpperArm.R': [-0.75, 0.88, armDown - 0.3],
            'LowerArm.R': [-0.48, 0, 0],
            'UpperArm.L': [-0.35, -0.25, -(armDown - 0.1)],
            'LowerArm.L': [-0.55, 0, 0],
            'UpperLeg.L': [0.22, 0, 0.06],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.28, 0, -0.06],
            'LowerLeg.R': [0.44, 0, 0],
          },
        },
        {
          time: 0.1,
          hipsOffsetY: -0.07,
          pose: {
            Hips: [0.08, 0.36, 0],
            Chest: [0.12, 0.62, 0],
            'UpperArm.R': [-0.85, 0.95, armDown - 0.35],
            'LowerArm.R': [-0.38, 0, 0],
            'UpperArm.L': [-0.3, -0.2, -(armDown - 0.1)],
            'LowerArm.L': [-0.5, 0, 0],
          },
        },
        {
          time: 0.25,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, -0.3, 0],
            Torso: [0.1, -0.35, 0],
            Chest: [0.14, -0.55, 0],
            'UpperArm.R': [-0.65, -0.82, armDown - 0.35],
            'LowerArm.R': [-0.25, 0, 0],
            'UpperArm.L': [-0.15, 0.2, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
        {
          time: 0.4,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.15, 0],
            Chest: [0.08, -0.25, 0],
            'UpperArm.R': [-0.72, -0.45, armDown - 0.28],
            'LowerArm.R': [-0.52, 0, 0],
            'UpperArm.L': [-0.25, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'Attack3',
      0.52,
      [
        {
          time: 0,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.1, 0, 0],
            Torso: [-0.08, -0.1, 0],
            Chest: [-0.12, -0.15, 0],
            'UpperArm.R': [-1.85, -0.25, armDown - 0.45],
            'LowerArm.R': [-0.65, 0, 0],
            'UpperArm.L': [-0.55, 0.2, -(armDown - 0.15)],
            'LowerArm.L': [-0.6, 0, 0],
            'UpperLeg.L': [-0.34, 0, 0.06],
            'LowerLeg.L': [0.54, 0, 0],
            'UpperLeg.R': [0.24, 0, -0.06],
            'LowerLeg.R': [0.35, 0, 0],
          },
        },
        {
          time: 0.16,
          hipsOffsetY: -0.09,
          pose: {
            Hips: [0.12, 0, 0],
            Torso: [-0.12, 0, 0],
            Chest: [-0.16, 0, 0],
            'UpperArm.R': [-2.15, -0.1, armDown - 0.5],
            'LowerArm.R': [-0.55, 0, 0],
            'UpperArm.L': [-0.45, 0.15, -(armDown - 0.15)],
            'LowerArm.L': [-0.55, 0, 0],
            'CoatBack.L': [0.45, 0, 0],
            'CoatBack.R': [0.45, 0, 0],
          },
        },
        {
          time: 0.34,
          hipsOffsetY: -0.1,
          pose: {
            Hips: [0.16, 0.14, 0],
            Torso: [0.28, 0.18, 0],
            Chest: [0.34, 0.24, 0],
            'UpperArm.R': [-0.35, 0.35, armDown - 0.2],
            'LowerArm.R': [-0.22, 0, 0],
            'UpperArm.L': [0.22, 0, -armDown],
            'LowerArm.L': [-0.35, 0, 0],
            'UpperLeg.L': [-0.52, 0, 0.06],
            'LowerLeg.L': [0.82, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.06],
            'LowerLeg.R': [0.32, 0, 0],
            'CoatBack.L': [0.75, 0, 0],
            'CoatBack.R': [0.75, 0, 0],
          },
        },
        {
          time: 0.52,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.05, 0],
            Chest: [0.08, 0.08, 0],
            'UpperArm.R': [-0.58, 0.15, armDown - 0.18],
            'LowerArm.R': [-0.65, 0, 0],
            'UpperArm.L': [-0.22, 0, -armDown],
            'LowerArm.L': [-0.4, 0, 0],
          },
        },
      ],
      bindMap
    ),
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

    // 8. Dynamic Magical Anime Flight (animated hover tread, arms & coat billow!)
    makePoseClip(
      'FlightHover',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.06, -0.04, 0],
            Head: [0.03, 0, 0],
            'UpperLeg.L': [-0.38, 0, 0.04],
            'LowerLeg.L': [0.68, 0, 0],
            'UpperLeg.R': [-0.1, 0, -0.04],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0.1, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.35, 0, 0],
            'UpperArm.R': [0.28, 0, armDown - 0.1],
            'LowerArm.R': [-0.55, 0, 0],
            'CoatBack.L': [0.35, 0, 0.05],
            'CoatBack.R': [0.42, 0, -0.05],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: 0.06,
          pose: {
            Torso: [0.1, 0.04, 0],
            Head: [0, 0, 0],
            'UpperLeg.L': [-0.14, 0, 0.04],
            'LowerLeg.L': [0.28, 0, 0],
            'UpperLeg.R': [-0.34, 0, -0.04],
            'LowerLeg.R': [0.64, 0, 0],
            'UpperArm.L': [0.28, 0, -(armDown - 0.06)],
            'LowerArm.L': [-0.55, 0, 0],
            'UpperArm.R': [0.1, 0, armDown - 0.06],
            'LowerArm.R': [-0.35, 0, 0],
            'CoatBack.L': [0.48, 0, -0.05],
            'CoatBack.R': [0.36, 0, 0.05],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: 0,
          pose: {
            Torso: [0.06, -0.04, 0],
            Head: [0.03, 0, 0],
            'UpperLeg.L': [-0.38, 0, 0.04],
            'LowerLeg.L': [0.68, 0, 0],
            'UpperLeg.R': [-0.1, 0, -0.04],
            'LowerLeg.R': [0.22, 0, 0],
            'UpperArm.L': [0.1, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.35, 0, 0],
            'UpperArm.R': [0.28, 0, armDown - 0.1],
            'LowerArm.R': [-0.55, 0, 0],
            'CoatBack.L': [0.35, 0, 0.05],
            'CoatBack.R': [0.42, 0, -0.05],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightForward',
      0.9,
      [
        {
          time: 0,
          pose: {
            Torso: [-0.08, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [0.26, 0, 0.03],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.05, 0, -0.03],
            'LowerLeg.R': [0.16, 0, 0],
            'UpperArm.L': [0.62, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.24, 0, 0],
            'UpperArm.R': [0.76, 0, armDown - 0.08],
            'LowerArm.R': [-0.38, 0, 0],
            'CoatBack.L': [0.75, 0, 0.06],
            'CoatBack.R': [0.85, 0, -0.06],
            'CoatSide.L': [0.55, 0, 0.08],
            'CoatSide.R': [0.62, 0, -0.08],
          },
        },
        {
          time: 0.45,
          hipsOffsetY: 0.03,
          pose: {
            Torso: [-0.05, 0, 0],
            Head: [-0.24, 0, 0],
            'UpperLeg.L': [0.06, 0, 0.03],
            'LowerLeg.L': [0.18, 0, 0],
            'UpperLeg.R': [0.28, 0, -0.03],
            'LowerLeg.R': [0.4, 0, 0],
            'UpperArm.L': [0.76, 0, -(armDown - 0.05)],
            'LowerArm.L': [-0.38, 0, 0],
            'UpperArm.R': [0.62, 0, armDown - 0.05],
            'LowerArm.R': [-0.24, 0, 0],
            'CoatBack.L': [0.88, 0, -0.06],
            'CoatBack.R': [0.75, 0, 0.06],
            'CoatSide.L': [0.62, 0, 0.08],
            'CoatSide.R': [0.55, 0, -0.08],
          },
        },
        {
          time: 0.9,
          pose: {
            Torso: [-0.08, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [0.26, 0, 0.03],
            'LowerLeg.L': [0.38, 0, 0],
            'UpperLeg.R': [0.05, 0, -0.03],
            'LowerLeg.R': [0.16, 0, 0],
            'UpperArm.L': [0.62, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.24, 0, 0],
            'UpperArm.R': [0.76, 0, armDown - 0.08],
            'LowerArm.R': [-0.38, 0, 0],
            'CoatBack.L': [0.75, 0, 0.06],
            'CoatBack.R': [0.85, 0, -0.06],
            'CoatSide.L': [0.55, 0, 0.08],
            'CoatSide.R': [0.62, 0, -0.08],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightAscend',
      0.9,
      [
        {
          time: 0,
          pose: {
            Torso: [-0.14, 0, 0],
            Head: [-0.2, 0, 0],
            'UpperLeg.L': [-0.42, 0, 0.04],
            'LowerLeg.L': [0.72, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.04],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [0.35, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0.48, 0, armDown - 0.1],
            'LowerArm.R': [-0.52, 0, 0],
            'CoatBack.L': [0.45, 0, 0],
            'CoatBack.R': [0.55, 0, 0],
          },
        },
        {
          time: 0.45,
          hipsOffsetY: 0.04,
          pose: {
            Torso: [-0.1, 0, 0],
            Head: [-0.18, 0, 0],
            'UpperLeg.L': [-0.24, 0, 0.04],
            'LowerLeg.L': [0.48, 0, 0],
            'UpperLeg.R': [-0.32, 0, -0.04],
            'LowerLeg.R': [0.58, 0, 0],
            'UpperArm.L': [0.48, 0, -(armDown - 0.08)],
            'LowerArm.L': [-0.52, 0, 0],
            'UpperArm.R': [0.35, 0, armDown - 0.08],
            'LowerArm.R': [-0.42, 0, 0],
            'CoatBack.L': [0.58, 0, 0],
            'CoatBack.R': [0.48, 0, 0],
          },
        },
        {
          time: 0.9,
          pose: {
            Torso: [-0.14, 0, 0],
            Head: [-0.2, 0, 0],
            'UpperLeg.L': [-0.42, 0, 0.04],
            'LowerLeg.L': [0.72, 0, 0],
            'UpperLeg.R': [-0.12, 0, -0.04],
            'LowerLeg.R': [0.28, 0, 0],
            'UpperArm.L': [0.35, 0, -(armDown - 0.1)],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperArm.R': [0.48, 0, armDown - 0.1],
            'LowerArm.R': [-0.52, 0, 0],
            'CoatBack.L': [0.45, 0, 0],
            'CoatBack.R': [0.55, 0, 0],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightDescend',
      0.9,
      [
        {
          time: 0,
          pose: {
            Torso: [0.12, 0, 0],
            Head: [0.1, 0, 0],
            'UpperLeg.L': [-0.15, 0, 0.04],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.32, 0, -0.04],
            'LowerLeg.R': [0.56, 0, 0],
            'UpperArm.L': [-0.12, 0, -(armDown - 0.15)],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [-0.26, 0, armDown - 0.15],
            'LowerArm.R': [-0.62, 0, 0],
            'CoatBack.L': [0.85, 0, 0],
            'CoatBack.R': [0.75, 0, 0],
          },
        },
        {
          time: 0.45,
          pose: {
            Torso: [0.15, 0, 0],
            Head: [0.12, 0, 0],
            'UpperLeg.L': [-0.28, 0, 0.04],
            'LowerLeg.L': [0.5, 0, 0],
            'UpperLeg.R': [-0.18, 0, -0.04],
            'LowerLeg.R': [0.36, 0, 0],
            'UpperArm.L': [-0.26, 0, -(armDown - 0.12)],
            'LowerArm.L': [-0.62, 0, 0],
            'UpperArm.R': [-0.12, 0, armDown - 0.12],
            'LowerArm.R': [-0.48, 0, 0],
            'CoatBack.L': [0.75, 0, 0],
            'CoatBack.R': [0.88, 0, 0],
          },
        },
        {
          time: 0.9,
          pose: {
            Torso: [0.12, 0, 0],
            Head: [0.1, 0, 0],
            'UpperLeg.L': [-0.15, 0, 0.04],
            'LowerLeg.L': [0.3, 0, 0],
            'UpperLeg.R': [-0.32, 0, -0.04],
            'LowerLeg.R': [0.56, 0, 0],
            'UpperArm.L': [-0.12, 0, -(armDown - 0.15)],
            'LowerArm.L': [-0.48, 0, 0],
            'UpperArm.R': [-0.26, 0, armDown - 0.15],
            'LowerArm.R': [-0.62, 0, 0],
            'CoatBack.L': [0.85, 0, 0],
            'CoatBack.R': [0.75, 0, 0],
          },
        },
      ],
      bindMap
    ),
  ];

  return clips;
}
