import * as THREE from 'three';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';

const RETARGET_CLIPS = ['idle', 'walk', 'run', 'sneak_pose', 'sad_pose'] as const;

const CLIP_NAME_MAP: Record<string, string> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  sneak_pose: 'CombatIdle',
  sad_pose: 'HitReaction',
};

interface BoneBindInfo {
  name: string;
  bindLocalQuat: THREE.Quaternion;
  worldBindQuat: THREE.Quaternion;
  worldBindQuatInv: THREE.Quaternion;
  hipsRestY: number;
}

function findFirstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });
  return found;
}

function extractBoneBindMap(skeleton: THREE.Skeleton): Map<string, BoneBindInfo> {
  const map = new Map<string, BoneBindInfo>();
  const worldBindMap = new Map<THREE.Object3D, THREE.Matrix4>();

  for (let i = 0; i < skeleton.bones.length; i++) {
    worldBindMap.set(skeleton.bones[i], new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert());
  }

  const parentInv = new THREE.Matrix4();
  const localM = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const wPos = new THREE.Vector3();
  const wQuat = new THREE.Quaternion();
  const wScl = new THREE.Vector3();

  for (let i = 0; i < skeleton.bones.length; i++) {
    const bone = skeleton.bones[i];
    const worldBind = worldBindMap.get(bone);
    if (!worldBind) continue;

    const parentWorldBind = bone.parent ? worldBindMap.get(bone.parent) : undefined;
    if (parentWorldBind) {
      parentInv.copy(parentWorldBind).invert();
      localM.copy(parentInv).multiply(worldBind);
    } else {
      localM.copy(worldBind);
    }

    localM.decompose(pos, quat, scl);
    worldBind.decompose(wPos, wQuat, wScl);

    map.set(bone.name, {
      name: bone.name,
      bindLocalQuat: quat.clone().normalize(),
      worldBindQuat: wQuat.clone().normalize(),
      worldBindQuatInv: wQuat.clone().normalize().invert(),
      hipsRestY: bone.position.y,
    });
  }

  return map;
}

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

type PoseSpec = Record<string, [number, number, number]>;

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
      posValues.push(0, hipsInfo.hipsRestY + (kf.hipsOffsetY ?? 0), 0);
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posValues));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Builds a complete set of real THREE.AnimationClips for `human.glb`:
 * - Retargets real Mixamo motion-capture clips (`idle`, `walk`, `run`) from `animations_mixamo.glb`
 * - Generates keyframed AnimationClips for combat, jump, flight, dodge, hit, and death states
 *   so `THREE.AnimationMixer` drives 100% of character locomotion & actions smoothly.
 */
export function buildHumanAnimationClips(
  targetScene: THREE.Object3D,
  sourceScene: THREE.Object3D,
  sourceAnimations: THREE.AnimationClip[]
): THREE.AnimationClip[] {
  const targetSkinned = findFirstSkinnedMesh(targetScene);
  const sourceSkinned = findFirstSkinnedMesh(sourceScene);
  if (!targetSkinned) return [];

  targetScene.updateMatrixWorld(true);
  sourceScene.updateMatrixWorld(true);

  const clips: THREE.AnimationClip[] = [];
  const bindMap = extractBoneBindMap(targetSkinned.skeleton);

  // 1. Retarget real Mixamo locomotion clips from Xbot (animations_mixamo.glb)
  if (sourceSkinned && sourceAnimations.length > 0) {
    const boneNames: Record<string, string> = {};
    for (const bone of targetSkinned.skeleton.bones) {
      boneNames[bone.name] = `mixamorig:${bone.name}`;
    }

    for (const srcName of RETARGET_CLIPS) {
      const srcClip = sourceAnimations.find((c) => c.name === srcName);
      if (!srcClip) continue;
      try {
        const retargeted = retargetClip(targetSkinned, sourceSkinned, srcClip, {
          names: boneNames,
          hip: 'Hips',
          preserveBoneMatrix: false,
          preserveHipPosition: false,
        });
        retargeted.name = CLIP_NAME_MAP[srcName] ?? srcName;

        // Keep Hips vertical motion while locking XZ so CharacterController owns ground translation
        const hipsTrack = retargeted.tracks.find(
          (t) => t.name === 'Hips.position'
        ) as THREE.VectorKeyframeTrack | undefined;
        if (hipsTrack) {
          for (let i = 0; i < hipsTrack.values.length; i += 3) {
            hipsTrack.values[i] = 0;
            hipsTrack.values[i + 2] = 0;
          }
        }
        clips.push(retargeted);
      } catch (err) {
        console.warn(`[Animation] Retarget failed for ${srcName}:`, err);
      }
    }
  }

  // Fallback Idle if retarget wasn't available
  if (!clips.some((c) => c.name === 'Idle')) {
    clips.push(
      makePoseClip(
        'Idle',
        2.0,
        [
          {
            time: 0,
            hipsOffsetY: 0,
            pose: {
              LeftArm: [0.03, 0, -0.34],
              RightArm: [0.03, 0, 0.34],
              LeftForeArm: [-0.15, 0, -0.34],
              RightForeArm: [-0.15, 0, 0.34],
            },
          },
          {
            time: 1.0,
            hipsOffsetY: 0.008,
            pose: {
              Spine1: [0.02, 0, 0],
              LeftArm: [0.05, 0, -0.32],
              RightArm: [0.05, 0, 0.32],
              LeftForeArm: [-0.18, 0, -0.32],
              RightForeArm: [-0.18, 0, 0.32],
            },
          },
          {
            time: 2.0,
            hipsOffsetY: 0,
            pose: {
              LeftArm: [0.03, 0, -0.34],
              RightArm: [0.03, 0, 0.34],
              LeftForeArm: [-0.15, 0, -0.34],
              RightForeArm: [-0.15, 0, 0.34],
            },
          },
        ],
        bindMap
      )
    );
  }

  // 2. Action & aerial AnimationClips played through AnimationMixer
  clips.push(
    makePoseClip(
      'JumpStart',
      0.22,
      [
        {
          time: 0,
          hipsOffsetY: -0.06,
          pose: {
            Spine: [0.15, 0, 0],
            LeftUpLeg: [-0.45, 0, 0],
            LeftLeg: [0.75, 0, 0],
            RightUpLeg: [-0.45, 0, 0],
            RightLeg: [0.75, 0, 0],
            LeftArm: [0.2, 0, -0.35],
            RightArm: [0.2, 0, 0.35],
          },
        },
        {
          time: 0.22,
          hipsOffsetY: 0.02,
          pose: {
            Spine: [0.08, 0, 0],
            LeftUpLeg: [-0.55, 0, 0.05],
            LeftLeg: [0.85, 0, 0],
            RightUpLeg: [-0.15, 0, -0.05],
            RightLeg: [0.42, 0, 0],
            LeftArm: [-0.6, 0, -0.35],
            RightArm: [-0.6, 0, 0.35],
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
            Spine: [0.08, 0, 0],
            LeftUpLeg: [-0.48, 0, 0.05],
            LeftLeg: [0.78, 0, 0],
            RightUpLeg: [-0.18, 0, -0.05],
            RightLeg: [0.4, 0, 0],
            LeftArm: [-0.48, 0, -0.35],
            RightArm: [-0.48, 0, 0.35],
          },
        },
        {
          time: 0.8,
          pose: {
            Spine: [0.08, 0, 0],
            LeftUpLeg: [-0.48, 0, 0.05],
            LeftLeg: [0.78, 0, 0],
            RightUpLeg: [-0.18, 0, -0.05],
            RightLeg: [0.4, 0, 0],
            LeftArm: [-0.48, 0, -0.35],
            RightArm: [-0.48, 0, 0.35],
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
            Spine: [0.05, 0, 0],
            LeftUpLeg: [-0.28, 0, 0.05],
            LeftLeg: [0.48, 0, 0],
            RightUpLeg: [-0.14, 0, -0.05],
            RightLeg: [0.32, 0, 0],
            LeftArm: [-0.25, 0, -0.2],
            RightArm: [-0.25, 0, 0.2],
          },
        },
        {
          time: 0.8,
          pose: {
            Spine: [0.05, 0, 0],
            LeftUpLeg: [-0.28, 0, 0.05],
            LeftLeg: [0.48, 0, 0],
            RightUpLeg: [-0.14, 0, -0.05],
            RightLeg: [0.32, 0, 0],
            LeftArm: [-0.25, 0, -0.2],
            RightArm: [-0.25, 0, 0.2],
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
            Spine: [0.18, 0, 0],
            LeftUpLeg: [-0.45, 0, 0.05],
            LeftLeg: [0.78, 0, 0],
            RightUpLeg: [-0.45, 0, -0.05],
            RightLeg: [0.78, 0, 0],
            LeftArm: [0.12, 0, -0.32],
            RightArm: [0.12, 0, 0.32],
          },
        },
        {
          time: 0.18,
          hipsOffsetY: 0,
          pose: {
            LeftArm: [0.03, 0, -0.34],
            RightArm: [0.03, 0, 0.34],
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
            Spine2: [0.08, -0.35, 0],
            RightArm: [-0.9, -0.5, 0.25],
            RightForeArm: [-0.55, 0, 0.25],
            LeftArm: [-0.25, 0, -0.35],
            LeftUpLeg: [-0.24, 0, 0.06],
            LeftLeg: [0.38, 0, 0],
            RightUpLeg: [0.2, 0, -0.06],
            RightLeg: [0.26, 0, 0],
          },
        },
        {
          time: 0.12,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.3, 0],
            Spine2: [0.12, -0.45, 0],
            RightArm: [-1.15, -0.65, 0.2],
            RightForeArm: [-0.45, 0, 0.2],
            LeftArm: [-0.2, 0, -0.35],
            LeftUpLeg: [-0.28, 0, 0.06],
            LeftLeg: [0.42, 0, 0],
            RightUpLeg: [0.22, 0, -0.06],
            RightLeg: [0.28, 0, 0],
          },
        },
        {
          time: 0.26,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.25, 0],
            Spine2: [0.14, 0.45, 0],
            RightArm: [-0.55, 0.75, 0.3],
            RightForeArm: [-0.25, 0, 0.3],
            LeftArm: [-0.15, 0, -0.38],
            LeftUpLeg: [-0.24, 0, 0.06],
            LeftLeg: [0.36, 0, 0],
            RightUpLeg: [0.18, 0, -0.06],
            RightLeg: [0.24, 0, 0],
          },
        },
        {
          time: 0.42,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.1, 0],
            Spine2: [0.08, 0.18, 0],
            RightArm: [-0.65, 0.2, 0.3],
            RightForeArm: [-0.65, 0, 0.3],
            LeftArm: [-0.25, 0, -0.35],
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
            Spine2: [0.1, 0.15, 0],
            RightArm: [-0.95, 0.45, 0.28],
            RightForeArm: [-1.05, -0.35, 0.28],
            LeftArm: [-0.55, -0.2, -0.32],
            LeftForeArm: [-0.8, 0, -0.32],
            LeftUpLeg: [-0.28, 0, 0.06],
            LeftLeg: [0.44, 0, 0],
            RightUpLeg: [0.22, 0, -0.06],
            RightLeg: [0.3, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.06,
          pose: {
            Hips: [0.08, -0.2, 0],
            Spine2: [0.1, 0.15, 0],
            RightArm: [-0.95, 0.45, 0.28],
            RightForeArm: [-1.05, -0.35, 0.28],
            LeftArm: [-0.55, -0.2, -0.32],
            LeftForeArm: [-0.8, 0, -0.32],
            LeftUpLeg: [-0.28, 0, 0.06],
            LeftLeg: [0.44, 0, 0],
            RightUpLeg: [0.22, 0, -0.06],
            RightLeg: [0.3, 0, 0],
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
            Spine2: [0.32, 0, 0],
            LeftUpLeg: [-0.55, 0, 0.05],
            LeftLeg: [0.88, 0, 0],
            RightUpLeg: [0.25, 0, -0.05],
            RightLeg: [0.55, 0, 0],
            LeftArm: [0.42, 0, -0.35],
            RightArm: [0.42, 0, 0.35],
          },
        },
        {
          time: 0.36,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.08, 0, 0],
            Spine2: [0.1, 0, 0],
            LeftArm: [0.1, 0, -0.34],
            RightArm: [0.1, 0, 0.34],
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
            Spine: [-0.15, 0, 0],
          },
        },
        {
          time: 0.45,
          hipsOffsetY: -0.45,
          pose: {
            Hips: [0.65, 0, 0],
            LeftUpLeg: [-0.45, 0, 0.08],
            LeftLeg: [0.85, 0, 0],
            RightUpLeg: [-0.35, 0, -0.08],
            RightLeg: [0.75, 0, 0],
            LeftArm: [-0.4, 0, -0.25],
            RightArm: [-0.4, 0, 0.25],
          },
        },
        {
          time: 0.85,
          hipsOffsetY: -0.88,
          pose: {
            Hips: [1.45, 0, 0],
            Spine2: [0.2, 0, 0],
            LeftUpLeg: [-0.2, 0, 0.1],
            LeftLeg: [0.3, 0, 0],
            RightUpLeg: [-0.15, 0, -0.1],
            RightLeg: [0.25, 0, 0],
            LeftArm: [-0.35, 0, -0.2],
            RightArm: [-0.35, 0, 0.2],
          },
        },
      ],
      bindMap
    ),
    makePoseClip(
      'FlightHover',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            Spine: [0.04, 0, 0],
            LeftUpLeg: [-0.16, 0, 0.05],
            LeftLeg: [0.38, 0, 0],
            RightUpLeg: [-0.08, 0, -0.05],
            RightLeg: [0.22, 0, 0],
            LeftArm: [-0.1, 0, -0.25],
            RightArm: [-0.1, 0, 0.25],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: 0.04,
          pose: {
            Spine: [0.06, 0, 0],
            LeftUpLeg: [-0.2, 0, 0.05],
            LeftLeg: [0.42, 0, 0],
            RightUpLeg: [-0.1, 0, -0.05],
            RightLeg: [0.25, 0, 0],
            LeftArm: [-0.14, 0, -0.22],
            RightArm: [-0.14, 0, 0.22],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: 0,
          pose: {
            Spine: [0.04, 0, 0],
            LeftUpLeg: [-0.16, 0, 0.05],
            LeftLeg: [0.38, 0, 0],
            RightUpLeg: [-0.08, 0, -0.05],
            RightLeg: [0.22, 0, 0],
            LeftArm: [-0.1, 0, -0.25],
            RightArm: [-0.1, 0, 0.25],
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
            Spine: [-0.1, 0, 0],
            Head: [-0.25, 0, 0],
            LeftUpLeg: [0.16, 0, 0.04],
            LeftLeg: [0.22, 0, 0],
            RightUpLeg: [0.1, 0, -0.04],
            RightLeg: [0.16, 0, 0],
            LeftArm: [0.55, 0, -0.3],
            RightArm: [0.55, 0, 0.3],
          },
        },
        {
          time: 1.2,
          pose: {
            Spine: [-0.1, 0, 0],
            Head: [-0.25, 0, 0],
            LeftUpLeg: [0.16, 0, 0.04],
            LeftLeg: [0.22, 0, 0],
            RightUpLeg: [0.1, 0, -0.04],
            RightLeg: [0.16, 0, 0],
            LeftArm: [0.55, 0, -0.3],
            RightArm: [0.55, 0, 0.3],
          },
        },
      ],
      bindMap
    )
  );

  return clips;
}
