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
    [/^Bip001[\s_]+Spine1(_\d+)?$/i, 'MidTorso'],
    [/^Bip001[\s_]+Spine2(_\d+)?$/i, 'Chest'],
    [/^Bip001[\s_]+Head(_\d+)?$/i, 'Head'],
    [/^Bip001[\s_]+L[\s_]+Clavicle(_\d+)?$/i, 'Clavicle.L'],
    [/^Bip001[\s_]+L[\s_]+UpperArm(_\d+)?$/i, 'UpperArm.L'],
    [/^Bip001[\s_]+L[\s_]+Forearm(_\d+)?$/i, 'LowerArm.L'],
    [/^Bip001[\s_]+L[\s_]+Hand(_\d+)?$/i, 'Hand.L'],
    [/^Bip001[\s_]+R[\s_]+Clavicle(_\d+)?$/i, 'Clavicle.R'],
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

    // 3. Athletic Forward-Drive Sprint Cycle (0.58s loop — real flight phase, high knee drive, dynamic arm pump)
    makePoseClip(
      'Run',
      0.58,
      [
        {
          // Left Foot Contact / Right Leg Full Push-Off
          time: 0,
          hipsOffsetY: -0.055,
          pose: {
            Hips: [0.16, 0.18, 0],
            Torso: [0.24, -0.22, 0],
            Chest: [0.12, -0.14, 0],
            Head: [-0.28, 0, 0],
            'Clavicle.L': [0, 0.12, 0],
            'Clavicle.R': [0, -0.12, 0],
            'UpperLeg.L': [-0.82, 0, 0.02],
            'LowerLeg.L': [0.46, 0, 0],
            'Foot.L': [-0.1, 0, 0],
            'UpperLeg.R': [0.84, 0, -0.02],
            'LowerLeg.R': [0.36, 0, 0],
            'Foot.R': [0.54, 0, 0],
            'UpperArm.L': [0.92, 0.14, -(armDown - 0.06)],
            'LowerArm.L': [-0.88, 0, 0],
            'UpperArm.R': [-1.04, -0.14, armDown - 0.06],
            'LowerArm.R': [-1.62, 0, 0],
            'CoatBack.L': [0.86, 0, 0.08],
            'CoatBack.R': [0.78, 0, -0.08],
            'CoatSide.L': [0.54, 0, 0.12],
            'CoatSide.R': [0.58, 0, -0.12],
          },
        },
        {
          // Flight Phase: Both feet airborne, Right Knee drives high, heel tucked
          time: 0.145,
          hipsOffsetY: 0.062,
          pose: {
            Hips: [0.16, 0, 0.03],
            Torso: [0.24, 0, 0],
            Chest: [0.12, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [0.22, 0, 0.02],
            'LowerLeg.L': [1.05, 0, 0],
            'Foot.L': [0.28, 0, 0],
            'UpperLeg.R': [-1.12, 0, -0.02],
            'LowerLeg.R': [1.72, 0, 0],
            'Foot.R': [-0.08, 0, 0],
            'UpperArm.L': [0.02, 0.05, -armDown],
            'LowerArm.L': [-1.35, 0, 0],
            'UpperArm.R': [0.02, -0.05, armDown],
            'LowerArm.R': [-1.35, 0, 0],
            'CoatBack.L': [1.02, 0, -0.06],
            'CoatBack.R': [1.02, 0, 0.06],
            'CoatSide.L': [0.62, 0, 0.1],
            'CoatSide.R': [0.62, 0, -0.1],
          },
        },
        {
          // Right Foot Contact / Left Leg Full Push-Off
          time: 0.29,
          hipsOffsetY: -0.055,
          pose: {
            Hips: [0.16, -0.18, 0],
            Torso: [0.24, 0.22, 0],
            Chest: [0.12, 0.14, 0],
            Head: [-0.28, 0, 0],
            'Clavicle.L': [0, -0.12, 0],
            'Clavicle.R': [0, 0.12, 0],
            'UpperLeg.L': [0.84, 0, 0.02],
            'LowerLeg.L': [0.36, 0, 0],
            'Foot.L': [0.54, 0, 0],
            'UpperLeg.R': [-0.82, 0, -0.02],
            'LowerLeg.R': [0.46, 0, 0],
            'Foot.R': [-0.1, 0, 0],
            'UpperArm.L': [-1.04, 0.14, -(armDown - 0.06)],
            'LowerArm.L': [-1.62, 0, 0],
            'UpperArm.R': [0.92, -0.14, armDown - 0.06],
            'LowerArm.R': [-0.88, 0, 0],
            'CoatBack.L': [0.78, 0, -0.08],
            'CoatBack.R': [0.86, 0, 0.08],
            'CoatSide.L': [0.58, 0, 0.12],
            'CoatSide.R': [0.54, 0, -0.12],
          },
        },
        {
          // Flight Phase: Both feet airborne, Left Knee drives high, heel tucked
          time: 0.435,
          hipsOffsetY: 0.062,
          pose: {
            Hips: [0.16, 0, -0.03],
            Torso: [0.24, 0, 0],
            Chest: [0.12, 0, 0],
            Head: [-0.28, 0, 0],
            'UpperLeg.L': [-1.12, 0, 0.02],
            'LowerLeg.L': [1.72, 0, 0],
            'Foot.L': [-0.08, 0, 0],
            'UpperLeg.R': [0.22, 0, -0.02],
            'LowerLeg.R': [1.05, 0, 0],
            'Foot.R': [0.28, 0, 0],
            'UpperArm.L': [0.02, 0.05, -armDown],
            'LowerArm.L': [-1.35, 0, 0],
            'UpperArm.R': [0.02, -0.05, armDown],
            'LowerArm.R': [-1.35, 0, 0],
            'CoatBack.L': [1.02, 0, 0.06],
            'CoatBack.R': [1.02, 0, -0.06],
            'CoatSide.L': [0.62, 0, 0.1],
            'CoatSide.R': [0.62, 0, -0.1],
          },
        },
        {
          time: 0.58,
          hipsOffsetY: -0.055,
          pose: {
            Hips: [0.16, 0.18, 0],
            Torso: [0.24, -0.22, 0],
            Chest: [0.12, -0.14, 0],
            Head: [-0.28, 0, 0],
            'Clavicle.L': [0, 0.12, 0],
            'Clavicle.R': [0, -0.12, 0],
            'UpperLeg.L': [-0.82, 0, 0.02],
            'LowerLeg.L': [0.46, 0, 0],
            'Foot.L': [-0.1, 0, 0],
            'UpperLeg.R': [0.84, 0, -0.02],
            'LowerLeg.R': [0.36, 0, 0],
            'Foot.R': [0.54, 0, 0],
            'UpperArm.L': [0.92, 0.14, -(armDown - 0.06)],
            'LowerArm.L': [-0.88, 0, 0],
            'UpperArm.R': [-1.04, -0.14, armDown - 0.06],
            'LowerArm.R': [-1.62, 0, 0],
            'CoatBack.L': [0.86, 0, 0.08],
            'CoatBack.R': [0.78, 0, -0.08],
            'CoatSide.L': [0.54, 0, 0.12],
            'CoatSide.R': [0.58, 0, -0.12],
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

    // 5. Natural One-Handed Swordsman CombatIdle
    makePoseClip(
      'CombatIdle',
      1.8,
      [
        {
          time: 0,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.05, -0.26, 0],
            Torso: [0.06, 0.12, 0],
            MidTorso: [0.04, 0.1, 0],
            Chest: [0.04, 0.1, 0],
            Head: [-0.04, -0.06, 0],
            'Clavicle.R': [0, 0.06, 0.04],
            'UpperArm.R': [-0.36, -0.22, armDown - 0.34],
            'LowerArm.R': [-0.88, 0, 0],
            'Hand.R': [0.12, -0.18, -0.14],
            'Clavicle.L': [0, -0.04, -0.04],
            'UpperArm.L': [-0.28, 0.22, -(armDown - 0.22)],
            'LowerArm.L': [-0.62, 0, 0],
            'Hand.L': [0, 0.1, 0.1],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'Foot.L': [-0.16, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'Foot.R': [0.12, 0, 0],
            'CoatBack.L': [0.1, 0, 0.03],
            'CoatBack.R': [0.1, 0, -0.03],
          },
        },
        {
          time: 0.9,
          hipsOffsetY: -0.028,
          pose: {
            Hips: [0.05, -0.25, 0],
            Torso: [0.08, 0.14, 0],
            MidTorso: [0.05, 0.11, 0],
            Chest: [0.06, 0.11, 0],
            Head: [-0.05, -0.08, 0],
            'Clavicle.R': [0, 0.07, 0.06],
            'UpperArm.R': [-0.42, -0.24, armDown - 0.32],
            'LowerArm.R': [-0.94, 0, 0],
            'Hand.R': [0.1, -0.16, -0.14],
            'Clavicle.L': [0, -0.05, -0.05],
            'UpperArm.L': [-0.32, 0.24, -(armDown - 0.2)],
            'LowerArm.L': [-0.68, 0, 0],
            'Hand.L': [0, 0.1, 0.1],
            'UpperLeg.L': [-0.24, 0.08, 0.06],
            'LowerLeg.L': [0.38, 0, 0],
            'Foot.L': [-0.14, 0, 0],
            'UpperLeg.R': [0.21, -0.18, -0.07],
            'LowerLeg.R': [0.32, 0, 0],
            'Foot.R': [0.11, 0, 0],
            'CoatBack.L': [0.13, 0, 0.03],
            'CoatBack.R': [0.13, 0, -0.03],
          },
        },
        {
          time: 1.8,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.05, -0.26, 0],
            Torso: [0.06, 0.12, 0],
            MidTorso: [0.04, 0.1, 0],
            Chest: [0.04, 0.1, 0],
            Head: [-0.04, -0.06, 0],
            'Clavicle.R': [0, 0.06, 0.04],
            'UpperArm.R': [-0.36, -0.22, armDown - 0.34],
            'LowerArm.R': [-0.88, 0, 0],
            'Hand.R': [0.12, -0.18, -0.14],
            'Clavicle.L': [0, -0.04, -0.04],
            'UpperArm.L': [-0.28, 0.22, -(armDown - 0.22)],
            'LowerArm.L': [-0.62, 0, 0],
            'Hand.L': [0, 0.1, 0.1],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'Foot.L': [-0.16, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'Foot.R': [0.12, 0, 0],
            'CoatBack.L': [0.1, 0, 0.03],
            'CoatBack.R': [0.1, 0, -0.03],
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

    // 7. Four-Hit Natural Swordsman Combo (Attack1..Attack4 + Attack alias)
    // ATTACK 1 — Quick Cross Slash (0.44s: coil right -> hip/torso whip -> diagonal cut to low-left follow-through)
    makePoseClip(
      'Attack1',
      0.44,
      [
        {
          // Preparation & weight shift onto back right leg
          time: 0,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, -0.24, 0],
            Torso: [0.06, 0.06, 0],
            MidTorso: [0.04, 0.06, 0],
            Chest: [0.04, 0.06, 0],
            Head: [-0.04, -0.04, 0],
            'Clavicle.R': [0, 0.02, 0.08],
            'UpperArm.R': [-0.62, -0.34, armDown - 0.36],
            'LowerArm.R': [-0.88, 0, 0],
            'Hand.R': [-0.1, -0.15, 0.08],
            'UpperArm.L': [-0.28, 0.2, -(armDown - 0.2)],
            'LowerArm.L': [-0.62, 0, 0],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'Foot.L': [-0.16, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'Foot.R': [0.12, 0, 0],
            'CoatBack.L': [0.14, 0, 0.03],
            'CoatBack.R': [0.14, 0, -0.03],
          },
        },
        {
          // Peak coil: pelvis & torso wind right, sword draws up-right over shoulder
          time: 0.095,
          hipsOffsetY: -0.065,
          pose: {
            Hips: [0.08, -0.38, 0],
            Torso: [0.06, -0.22, 0],
            MidTorso: [0.05, -0.18, 0],
            Chest: [0.06, -0.2, 0],
            Head: [0.02, 0.38, 0],
            'Clavicle.R': [0, -0.18, 0.18],
            'UpperArm.R': [-1.58, -0.56, armDown - 0.56],
            'LowerArm.R': [-0.95, 0, 0],
            'Hand.R': [-0.24, -0.18, 0.18],
            'UpperArm.L': [-0.22, 0.18, -(armDown - 0.12)],
            'LowerArm.L': [-0.52, 0, 0],
            'UpperLeg.L': [-0.34, 0.08, 0.06],
            'LowerLeg.L': [0.54, 0, 0],
            'UpperLeg.R': [0.3, -0.18, -0.07],
            'LowerLeg.R': [0.44, 0, 0],
            'CoatBack.L': [0.28, 0, 0.05],
            'CoatBack.R': [0.28, 0, -0.05],
          },
        },
        {
          // Hip & torso initiate forward whip while arm lags slightly
          time: 0.165,
          hipsOffsetY: -0.085,
          pose: {
            Hips: [0.11, 0.12, 0],
            Torso: [0.11, 0.1, 0],
            MidTorso: [0.09, 0.02, 0],
            Chest: [0.09, -0.02, 0],
            Head: [0.02, 0.02, 0],
            'Clavicle.R': [0, 0.06, 0.08],
            'UpperArm.R': [-1.18, -0.08, armDown - 0.42],
            'LowerArm.R': [-0.46, 0, 0],
            'Hand.R': [0.08, 0, 0],
            'UpperArm.L': [0.12, -0.12, -(armDown - 0.12)],
            'LowerArm.L': [-0.45, 0, 0],
            'UpperLeg.L': [-0.48, 0.06, 0.06],
            'LowerLeg.L': [0.74, 0, 0],
            'Foot.L': [-0.22, 0, 0],
            'UpperLeg.R': [0.38, -0.14, -0.07],
            'LowerLeg.R': [0.3, 0, 0],
            'CoatBack.L': [0.48, 0, -0.03],
            'CoatBack.R': [0.48, 0, 0.03],
          },
        },
        {
          // Contact & follow-through: clean diagonal extension + wrist snap across low-left
          time: 0.27,
          hipsOffsetY: -0.075,
          pose: {
            Hips: [0.1, 0.3, 0],
            Torso: [0.12, 0.2, 0],
            MidTorso: [0.1, 0.16, 0],
            Chest: [0.12, 0.2, 0],
            Head: [0.02, -0.28, 0],
            'Clavicle.R': [0, 0.2, -0.06],
            'UpperArm.R': [-0.36, 0.88, armDown - 0.18],
            'LowerArm.R': [-0.24, 0, 0],
            'Hand.R': [0.32, 0.18, -0.22],
            'UpperArm.L': [0.3, -0.24, -(armDown - 0.14)],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperLeg.L': [-0.5, 0.06, 0.06],
            'LowerLeg.L': [0.76, 0, 0],
            'Foot.L': [-0.22, 0, 0],
            'UpperLeg.R': [0.4, -0.14, -0.07],
            'LowerLeg.R': [0.28, 0, 0],
            'CoatBack.L': [0.58, 0, -0.05],
            'CoatBack.R': [0.58, 0, 0.05],
          },
        },
        {
          // Recovery back toward balanced CombatIdle stance
          time: 0.44,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.06, -0.12, 0],
            Torso: [0.07, 0.1, 0],
            MidTorso: [0.05, 0.08, 0],
            Chest: [0.05, 0.08, 0],
            Head: [-0.02, -0.08, 0],
            'Clavicle.R': [0, 0.08, 0.02],
            'UpperArm.R': [-0.42, 0.12, armDown - 0.28],
            'LowerArm.R': [-0.74, 0, 0],
            'Hand.R': [0.1, -0.08, -0.12],
            'UpperArm.L': [-0.24, 0.16, -(armDown - 0.2)],
            'LowerArm.L': [-0.56, 0, 0],
            'UpperLeg.L': [-0.28, 0.08, 0.06],
            'LowerLeg.L': [0.44, 0, 0],
            'UpperLeg.R': [0.24, -0.16, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.16, 0, 0],
            'CoatBack.R': [0.16, 0, 0],
          },
        },
      ],
      bindMap
    ),
    // ATTACK 2 — Reverse Rising Slash (0.44s: flows seamlessly from Attack1 low-left -> rising diagonal cut up-right)
    makePoseClip(
      'Attack2',
      0.44,
      [
        {
          // Seamless entry from Attack 1 follow-through (low-left)
          time: 0,
          hipsOffsetY: -0.07,
          pose: {
            Hips: [0.1, 0.28, 0],
            Torso: [0.11, 0.2, 0],
            MidTorso: [0.09, 0.16, 0],
            Chest: [0.1, 0.18, 0],
            Head: [0.02, -0.26, 0],
            'Clavicle.R': [0, 0.18, -0.05],
            'UpperArm.R': [-0.36, 0.88, armDown - 0.2],
            'LowerArm.R': [-0.34, 0, 0],
            'Hand.R': [0.24, 0.16, -0.18],
            'UpperArm.L': [-0.28, -0.2, -(armDown - 0.1)],
            'LowerArm.L': [-0.54, 0, 0],
            'UpperLeg.L': [-0.34, 0.06, 0.06],
            'LowerLeg.L': [0.54, 0, 0],
            'UpperLeg.R': [0.28, -0.14, -0.06],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.28, 0, 0],
            'CoatBack.R': [0.28, 0, 0],
          },
        },
        {
          // Peak reverse coil: low stance, blade loaded low-left
          time: 0.095,
          hipsOffsetY: -0.085,
          pose: {
            Hips: [0.1, 0.38, 0],
            Torso: [0.1, 0.24, 0],
            MidTorso: [0.08, 0.2, 0],
            Chest: [0.1, 0.22, 0],
            Head: [0.02, -0.34, 0],
            'Clavicle.R': [0, 0.22, -0.06],
            'UpperArm.R': [-0.28, 0.98, armDown - 0.22],
            'LowerArm.R': [-0.42, 0, 0],
            'Hand.R': [0.18, 0.22, -0.16],
            'UpperArm.L': [-0.3, -0.18, -(armDown - 0.1)],
            'LowerArm.L': [-0.5, 0, 0],
            'UpperLeg.L': [0.18, 0.06, 0.06],
            'LowerLeg.L': [0.34, 0, 0],
            'UpperLeg.R': [-0.38, -0.14, -0.06],
            'LowerLeg.R': [0.58, 0, 0],
          },
        },
        {
          // Pelvis & torso drive reverse rotation before arm whips up-right
          time: 0.175,
          hipsOffsetY: -0.065,
          pose: {
            Hips: [0.08, -0.08, 0],
            Torso: [0.08, -0.1, 0],
            MidTorso: [0.04, -0.06, 0],
            Chest: [0.02, 0, 0],
            Head: [0.02, 0.04, 0],
            'Clavicle.R': [0, 0.02, 0.08],
            'UpperArm.R': [-0.98, 0.18, armDown - 0.42],
            'LowerArm.R': [-0.36, 0, 0],
            'Hand.R': [0.04, 0.04, 0],
            'UpperArm.L': [-0.04, 0.1, -(armDown - 0.1)],
            'LowerArm.L': [-0.46, 0, 0],
            'UpperLeg.L': [-0.3, 0.06, 0.06],
            'LowerLeg.L': [0.48, 0, 0],
            'UpperLeg.R': [0.18, -0.12, -0.06],
            'LowerLeg.R': [0.32, 0, 0],
          },
        },
        {
          // Contact & follow-through: rising diagonal cleave up-right + wrist snap
          time: 0.28,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.08, -0.32, 0],
            Torso: [0.03, -0.24, 0],
            MidTorso: [-0.02, -0.18, 0],
            Chest: [-0.06, -0.2, 0],
            Head: [0.03, 0.34, 0],
            'Clavicle.R': [0, -0.2, 0.18],
            'UpperArm.R': [-1.42, -0.74, armDown - 0.56],
            'LowerArm.R': [-0.22, 0, 0],
            'Hand.R': [-0.26, -0.22, 0.22],
            'UpperArm.L': [0.22, 0.24, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperLeg.L': [-0.38, 0.06, 0.06],
            'LowerLeg.L': [0.56, 0, 0],
            'UpperLeg.R': [0.3, -0.16, -0.06],
            'LowerLeg.R': [0.28, 0, 0],
            'CoatBack.L': [0.58, 0, 0.05],
            'CoatBack.R': [0.58, 0, -0.05],
          },
        },
        {
          // Recovery
          time: 0.44,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.06, -0.22, 0],
            Torso: [0.06, 0.06, 0],
            MidTorso: [0.04, 0.04, 0],
            Chest: [0.04, 0.04, 0],
            Head: [-0.02, -0.02, 0],
            'Clavicle.R': [0, 0.02, 0.06],
            'UpperArm.R': [-0.62, -0.34, armDown - 0.34],
            'LowerArm.R': [-0.72, 0, 0],
            'Hand.R': [0.08, -0.14, -0.06],
            'UpperArm.L': [-0.26, 0.18, -(armDown - 0.18)],
            'LowerArm.L': [-0.56, 0, 0],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.2, 0, 0],
            'CoatBack.R': [0.2, 0, 0],
          },
        },
      ],
      bindMap
    ),
    // ATTACK 3 — Spinning Crescent (0.58s: low athletic drop -> horizontal 360° blade sweep -> crisp plant & brake)
    makePoseClip(
      'Attack3',
      0.58,
      [
        {
          // Preparation crouch & wind-up
          time: 0,
          hipsOffsetY: -0.075,
          pose: {
            Hips: [0.09, -0.28, 0],
            Torso: [0.09, -0.16, 0],
            MidTorso: [0.06, -0.14, 0],
            Chest: [0.06, -0.16, 0],
            Head: [0.02, 0.24, 0],
            'Clavicle.R': [0, -0.14, 0.08],
            'UpperArm.R': [-0.88, -0.62, armDown - 0.46],
            'LowerArm.R': [-0.48, 0, 0],
            'Hand.R': [0.05, -0.14, 0],
            'UpperArm.L': [-0.42, 0.36, -(armDown - 0.22)],
            'LowerArm.L': [-0.86, 0, 0],
            'UpperLeg.L': [-0.4, 0.06, 0.08],
            'LowerLeg.L': [0.66, 0, 0],
            'UpperLeg.R': [0.3, -0.12, -0.08],
            'LowerLeg.R': [0.48, 0, 0],
            'CoatBack.L': [0.34, 0, -0.12],
            'CoatBack.R': [0.34, 0, 0.12],
          },
        },
        {
          // Pivot launch: push off right leg, blade sweeps out horizontally at chest level
          time: 0.13,
          hipsOffsetY: -0.085,
          pose: {
            Hips: [0.11, 0.08, 0],
            Torso: [0.14, 0.16, -0.06],
            MidTorso: [0.09, 0.12, 0],
            Chest: [0.09, 0.16, 0],
            Head: [0.02, -0.1, 0],
            'Clavicle.R': [0, 0.08, 0.04],
            'UpperArm.R': [-1.06, -0.25, armDown - 0.94],
            'LowerArm.R': [-0.2, 0, 0],
            'Hand.R': [0.12, 0.1, -0.28],
            'UpperArm.L': [-0.52, 0.52, -(armDown - 0.24)],
            'LowerArm.L': [-1.05, 0, 0],
            'UpperLeg.L': [-0.36, 0.08, 0.08],
            'LowerLeg.L': [0.58, 0, 0],
            'UpperLeg.R': [0.14, -0.16, -0.1],
            'LowerLeg.R': [0.76, 0, 0],
            'CoatBack.L': [0.68, 0, -0.24],
            'CoatBack.R': [0.68, 0, 0.24],
          },
        },
        {
          // Mid-spin crescent sweep (full horizontal extension, compact tucked balance)
          time: 0.31,
          hipsOffsetY: -0.065,
          pose: {
            Hips: [0.11, 0.22, 0],
            Torso: [0.14, 0.22, -0.06],
            MidTorso: [0.09, 0.18, 0],
            Chest: [0.09, 0.24, 0],
            Head: [0.02, -0.18, 0],
            'Clavicle.R': [0, 0.16, -0.04],
            'UpperArm.R': [-1.04, 0.45, armDown - 0.96],
            'LowerArm.R': [-0.18, 0, 0],
            'Hand.R': [0.15, 0.22, -0.32],
            'UpperArm.L': [-0.48, 0.48, -(armDown - 0.22)],
            'LowerArm.L': [-0.96, 0, 0],
            'UpperLeg.L': [-0.32, 0.1, 0.08],
            'LowerLeg.L': [0.52, 0, 0],
            'UpperLeg.R': [-0.12, -0.12, -0.1],
            'LowerLeg.R': [0.82, 0, 0],
            'CoatBack.L': [0.82, 0, -0.26],
            'CoatBack.R': [0.82, 0, 0.26],
          },
        },
        {
          // Plant right foot to arrest spin & follow through across chest
          time: 0.44,
          hipsOffsetY: -0.07,
          pose: {
            Hips: [0.08, 0.28, 0],
            Torso: [0.1, 0.2, 0],
            MidTorso: [0.08, 0.16, 0],
            Chest: [0.08, 0.18, 0],
            Head: [0.02, -0.24, 0],
            'Clavicle.R': [0, 0.18, -0.04],
            'UpperArm.R': [-0.82, 0.86, armDown - 0.46],
            'LowerArm.R': [-0.36, 0, 0],
            'Hand.R': [0.08, 0.24, -0.16],
            'UpperArm.L': [0.14, -0.22, -(armDown - 0.14)],
            'LowerArm.L': [-0.62, 0, 0],
            'UpperLeg.L': [-0.34, 0.08, 0.08],
            'LowerLeg.L': [0.56, 0, 0],
            'UpperLeg.R': [0.28, -0.16, -0.08],
            'LowerLeg.R': [0.4, 0, 0],
            'CoatBack.L': [0.5, 0, -0.1],
            'CoatBack.R': [0.5, 0, 0.1],
          },
        },
        {
          // Recovery to CombatIdle
          time: 0.58,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.05, -0.2, 0],
            Torso: [0.06, 0.1, 0],
            MidTorso: [0.04, 0.08, 0],
            Chest: [0.04, 0.08, 0],
            Head: [-0.04, -0.06, 0],
            'Clavicle.R': [0, 0.06, 0.04],
            'UpperArm.R': [-0.42, -0.12, armDown - 0.3],
            'LowerArm.R': [-0.78, 0, 0],
            'Hand.R': [0.1, -0.14, -0.12],
            'UpperArm.L': [-0.26, 0.2, -(armDown - 0.2)],
            'LowerArm.L': [-0.58, 0, 0],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.16, 0, 0],
            'CoatBack.R': [0.16, 0, 0],
          },
        },
      ],
      bindMap
    ),
    // ATTACK 4 — Arcane Breaker Finisher (0.74s: compression -> committed overhead gather -> deep lunge cleave -> impact -> recovery)
    makePoseClip(
      'Attack4',
      0.74,
      [
        {
          // Slight body compression & gather
          time: 0,
          hipsOffsetY: -0.08,
          pose: {
            Hips: [0.08, -0.12, 0],
            Torso: [0.04, 0, 0],
            MidTorso: [0.02, 0, 0],
            Chest: [0, 0, 0],
            Head: [0, 0.04, 0],
            'Clavicle.R': [0, -0.04, 0.14],
            'UpperArm.R': [-1.25, -0.24, armDown - 0.42],
            'LowerArm.R': [-0.85, 0, 0],
            'Hand.R': [0, -0.08, 0],
            'UpperArm.L': [-0.68, 0.24, -(armDown - 0.22)],
            'LowerArm.L': [-0.74, 0, 0],
            'UpperLeg.L': [-0.38, 0.06, 0.06],
            'LowerLeg.L': [0.62, 0, 0],
            'UpperLeg.R': [0.28, -0.14, -0.06],
            'LowerLeg.R': [0.42, 0, 0],
            'CoatBack.L': [0.22, 0, 0],
            'CoatBack.R': [0.22, 0, 0],
          },
        },
        {
          // Peak overhead preparation: chest opens, both arms raised high for heavy cleave
          time: 0.21,
          hipsOffsetY: 0.04,
          pose: {
            Hips: [0.04, -0.08, 0],
            Torso: [-0.12, 0, 0],
            MidTorso: [-0.12, 0, 0],
            Chest: [-0.14, -0.04, 0],
            Head: [0.14, 0, 0],
            'Clavicle.R': [0, -0.04, 0.32],
            'UpperArm.R': [-2.65, -0.06, armDown - 0.64],
            'LowerArm.R': [-0.46, 0, 0],
            'Hand.R': [-0.22, 0, 0],
            'Clavicle.L': [0, 0.04, -0.26],
            'UpperArm.L': [-2.18, 0.28, -(armDown - 0.52)],
            'LowerArm.L': [-0.66, 0, 0],
            'UpperLeg.L': [-0.2, 0.06, 0.06],
            'LowerLeg.L': [0.32, 0, 0],
            'UpperLeg.R': [0.16, -0.14, -0.06],
            'LowerLeg.R': [0.24, 0, 0],
            'CoatBack.L': [0.46, 0, 0],
            'CoatBack.R': [0.46, 0, 0],
          },
        },
        {
          // Forward weight transfer: front leg lunges, hips & spine drive downward
          time: 0.32,
          hipsOffsetY: -0.085,
          pose: {
            Hips: [0.15, 0.06, 0],
            Torso: [0.16, 0.08, 0],
            MidTorso: [0.13, 0.06, 0],
            Chest: [0.14, 0.06, 0],
            Head: [-0.08, -0.04, 0],
            'Clavicle.R': [0, 0.08, 0.12],
            'UpperArm.R': [-1.48, 0.1, armDown - 0.36],
            'LowerArm.R': [-0.3, 0, 0],
            'Hand.R': [0.12, 0.04, 0],
            'UpperArm.L': [-0.32, 0.08, -(armDown - 0.15)],
            'LowerArm.L': [-0.56, 0, 0],
            'UpperLeg.L': [-0.54, 0.06, 0.07],
            'LowerLeg.L': [0.84, 0, 0],
            'UpperLeg.R': [0.46, -0.12, -0.07],
            'LowerLeg.R': [0.32, 0, 0],
            'CoatBack.L': [0.72, 0, 0],
            'CoatBack.R': [0.72, 0, 0],
          },
        },
        {
          // Contact & impact: full downward cleave, deep lunge, wrist snap
          time: 0.43,
          hipsOffsetY: -0.15,
          pose: {
            Hips: [0.19, 0.14, 0],
            Torso: [0.24, 0.12, 0],
            MidTorso: [0.18, 0.1, 0],
            Chest: [0.2, 0.1, 0],
            Head: [-0.16, -0.08, 0],
            'Clavicle.R': [0, 0.18, -0.06],
            'UpperArm.R': [-0.28, 0.18, armDown - 0.18],
            'LowerArm.R': [-0.2, 0, 0],
            'Hand.R': [0.36, 0.1, -0.1],
            'UpperArm.L': [0.36, -0.16, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperLeg.L': [-0.64, 0.06, 0.08],
            'LowerLeg.L': [0.96, 0, 0],
            'Foot.L': [-0.24, 0, 0],
            'UpperLeg.R': [0.5, -0.12, -0.08],
            'LowerLeg.R': [0.32, 0, 0],
            'CoatBack.L': [0.88, 0, 0],
            'CoatBack.R': [0.88, 0, 0],
          },
        },
        {
          // Brief impact hold (weight settles into ground)
          time: 0.55,
          hipsOffsetY: -0.155,
          pose: {
            Hips: [0.19, 0.16, 0],
            Torso: [0.25, 0.12, 0],
            MidTorso: [0.18, 0.1, 0],
            Chest: [0.2, 0.1, 0],
            Head: [-0.14, -0.08, 0],
            'Clavicle.R': [0, 0.18, -0.06],
            'UpperArm.R': [-0.24, 0.2, armDown - 0.16],
            'LowerArm.R': [-0.22, 0, 0],
            'Hand.R': [0.34, 0.1, -0.1],
            'UpperArm.L': [0.38, -0.16, -armDown],
            'LowerArm.L': [-0.42, 0, 0],
            'UpperLeg.L': [-0.64, 0.06, 0.08],
            'LowerLeg.L': [0.98, 0, 0],
            'UpperLeg.R': [0.5, -0.12, -0.08],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.66, 0, 0],
            'CoatBack.R': [0.66, 0, 0],
          },
        },
        {
          // Heavy recovery back to CombatIdle
          time: 0.74,
          hipsOffsetY: -0.045,
          pose: {
            Hips: [0.05, -0.22, 0],
            Torso: [0.06, 0.1, 0],
            MidTorso: [0.04, 0.08, 0],
            Chest: [0.04, 0.08, 0],
            Head: [-0.04, -0.06, 0],
            'Clavicle.R': [0, 0.06, 0.04],
            'UpperArm.R': [-0.42, -0.16, armDown - 0.3],
            'LowerArm.R': [-0.82, 0, 0],
            'Hand.R': [0.1, -0.16, -0.12],
            'UpperArm.L': [-0.26, 0.2, -(armDown - 0.2)],
            'LowerArm.L': [-0.6, 0, 0],
            'UpperLeg.L': [-0.26, 0.08, 0.06],
            'LowerLeg.L': [0.42, 0, 0],
            'UpperLeg.R': [0.22, -0.18, -0.07],
            'LowerLeg.R': [0.34, 0, 0],
            'CoatBack.L': [0.16, 0, 0],
            'CoatBack.R': [0.16, 0, 0],
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
