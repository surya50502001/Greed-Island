import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

interface BoneBindInfo {
  bone: THREE.Bone;
  parentName: string | null;
  bindLocalQuat: THREE.Quaternion;
  worldBindPos: THREE.Vector3;
  worldBindQuat: THREE.Quaternion;
  worldBindQuatInv: THREE.Quaternion;
  restLocalPos: THREE.Vector3;
  hipsUnitScale: number;
}

type PoseSpec = Record<string, [number, number, number]>;

const MIXAMO_TO_HUMAN_CLIP: Record<string, string> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
};

const LIMB_ALIGNMENT_CHILDREN: Record<string, string> = {
  LeftShoulder: 'LeftArm',
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
  RightFoot: 'RightToeBase',
};

function stripMixamoPrefix(name: string): string {
  return name.replace(/^mixamorig:?/i, '');
}

function collectBoneBindData(scene: THREE.Object3D): {
  bindMap: Map<string, BoneBindInfo>;
  orderedBones: string[];
} {
  scene.updateMatrixWorld(true);
  const bindMap = new Map<string, BoneBindInfo>();
  const orderedBones: string[] = [];

  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      bone.getWorldPosition(wp);
      bone.getWorldQuaternion(wq);
      wq.normalize();
      const restPos = bone.position.clone();
      const parentName = bone.parent && (bone.parent as THREE.Bone).isBone ? bone.parent.name : null;

      bindMap.set(bone.name, {
        bone,
        parentName,
        bindLocalQuat: bone.quaternion.clone().normalize(),
        worldBindPos: wp,
        worldBindQuat: wq,
        worldBindQuatInv: wq.clone().invert(),
        restLocalPos: restPos,
        hipsUnitScale: restPos.length() > 0.2 ? 1 : 0.01,
      });
      orderedBones.push(bone.name);
    }
  });

  return { bindMap, orderedBones };
}

/**
 * Builds keyframed AnimationClips by evaluating desired world-space character
 * delta rotations per bone and converting cleanly through the parent chain
 * so child bones (forearms, shins, spine) never double-apply parent rotations.
 */
function makePoseClip(
  name: string,
  duration: number,
  keyframes: Array<{ time: number; pose: PoseSpec; hipsOffsetY?: number }>,
  bindMap: Map<string, BoneBindInfo>,
  orderedBones: string[],
  hipsBoneName = 'Hips'
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const specifiedBones = new Set<string>();
  keyframes.forEach((kf) => Object.keys(kf.pose).forEach((b) => specifiedBones.add(b)));

  // Include descendants whose parent is specified, or simply evaluate all bones in pose
  const animatedBones = orderedBones.filter((b) => specifiedBones.has(b));
  const times = keyframes.map((kf) => kf.time);
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  const trackValues = new Map<string, number[]>();
  for (const b of animatedBones) {
    trackValues.set(b, []);
  }

  for (const kf of keyframes) {
    const effectiveCharQ = new Map<string, THREE.Quaternion>();
    const desiredWorldQ = new Map<string, THREE.Quaternion>();

    for (const boneName of orderedBones) {
      const info = bindMap.get(boneName);
      if (!info) continue;
      const parentCharQ = info.parentName ? effectiveCharQ.get(info.parentName) : undefined;
      const rot = kf.pose[boneName];
      const charQ = rot
        ? new THREE.Quaternion().setFromEuler(euler.set(rot[0], rot[1], rot[2]))
        : parentCharQ
          ? parentCharQ.clone()
          : new THREE.Quaternion();
      effectiveCharQ.set(boneName, charQ);
      desiredWorldQ.set(boneName, charQ.clone().multiply(info.worldBindQuat).normalize());
    }

    for (const boneName of animatedBones) {
      const info = bindMap.get(boneName)!;
      const parentWorldQ = info.parentName
        ? desiredWorldQ.get(info.parentName) ?? new THREE.Quaternion()
        : new THREE.Quaternion();
      const localQ = parentWorldQ
        .clone()
        .invert()
        .multiply(desiredWorldQ.get(boneName)!)
        .normalize();
      trackValues.get(boneName)!.push(localQ.x, localQ.y, localQ.z, localQ.w);
    }
  }

  for (const boneName of animatedBones) {
    const vals = trackValues.get(boneName)!;
    if (vals.length > 0) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, vals));
    }
  }

  const hipsInfo = bindMap.get(hipsBoneName);
  if (hipsInfo && keyframes.some((kf) => kf.hipsOffsetY !== undefined)) {
    const posValues: number[] = [];
    for (const kf of keyframes) {
      posValues.push(
        hipsInfo.restLocalPos.x,
        hipsInfo.restLocalPos.y + (kf.hipsOffsetY ?? 0) * hipsInfo.hipsUnitScale,
        hipsInfo.restLocalPos.z
      );
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsBoneName}.position`, times, posValues));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Retargets a Mixamo AnimationClip onto a ReadyPlayerMe / Mixamo-named target skeleton
 * (`human.glb`) using world-space rotation deltas + automatic T-pose/A-pose limb alignment.
 * Outputs `BoneName.quaternion` and `Hips.position` tracks compatible with
 * `new THREE.AnimationMixer(targetScene)`.
 */
function retargetMixamoClip(
  srcClip: THREE.AnimationClip,
  outName: string,
  targetBind: Map<string, BoneBindInfo>,
  targetOrdered: string[],
  sourceClone: THREE.Object3D,
  sourceByStrippedName: Map<string, BoneBindInfo>,
  alignInvMap: Map<string, THREE.Quaternion>
): THREE.AnimationClip {
  const fps = 30;
  const numFrames = Math.max(2, Math.round(srcClip.duration * fps) + 1);
  const times = new Float32Array(numFrames);

  const mixer = new THREE.AnimationMixer(sourceClone);
  const action = mixer.clipAction(srcClip);
  action.play();

  const mappedBones = targetOrdered.filter((n) => sourceByStrippedName.has(n));
  const quatValues = new Map<string, Float32Array>(
    mappedBones.map((n) => [n, new Float32Array(numFrames * 4)])
  );
  const hipsPosValues = new Float32Array(numFrames * 3);

  const srcHips = sourceByStrippedName.get('Hips');
  const tgtHips = targetBind.get('Hips');
  const srcHipsBindY = srcHips ? srcHips.worldBindPos.y : 1;

  const tmpSrcWorldQ = new THREE.Quaternion();
  const tmpDeltaWorld = new THREE.Quaternion();
  const tmpTargetWorldQ = new THREE.Quaternion();
  const tmpLocalQ = new THREE.Quaternion();
  const tmpParentInv = new THREE.Quaternion();
  const tmpSrcHipsWP = new THREE.Vector3();
  const identityQ = new THREE.Quaternion();

  for (let f = 0; f < numFrames; f++) {
    const ratio = f / (numFrames - 1);
    const sampleTime = Math.min(srcClip.duration - 1e-5, ratio * srcClip.duration);
    times[f] = ratio * srcClip.duration;

    mixer.setTime(sampleTime);
    sourceClone.updateMatrixWorld(true);

    const desiredWorldQ = new Map<string, THREE.Quaternion>();

    for (const boneName of targetOrdered) {
      const tgtInfo = targetBind.get(boneName)!;
      const srcInfo = sourceByStrippedName.get(boneName);

      if (srcInfo) {
        srcInfo.bone.getWorldQuaternion(tmpSrcWorldQ);
        tmpDeltaWorld.copy(tmpSrcWorldQ).multiply(srcInfo.worldBindQuatInv);
        const alignInv = alignInvMap.get(boneName);
        if (alignInv) {
          tmpTargetWorldQ
            .copy(tmpDeltaWorld)
            .multiply(alignInv)
            .multiply(tgtInfo.worldBindQuat)
            .normalize();
        } else {
          tmpTargetWorldQ.copy(tmpDeltaWorld).multiply(tgtInfo.worldBindQuat).normalize();
        }
        desiredWorldQ.set(boneName, tmpTargetWorldQ.clone());
      } else {
        const parentWorldQ = tgtInfo.parentName
          ? desiredWorldQ.get(tgtInfo.parentName) ?? identityQ
          : identityQ;
        desiredWorldQ.set(
          boneName,
          parentWorldQ.clone().multiply(tgtInfo.bindLocalQuat).normalize()
        );
      }
    }

    for (const boneName of mappedBones) {
      const tgtInfo = targetBind.get(boneName)!;
      const parentWorldQ = tgtInfo.parentName
        ? desiredWorldQ.get(tgtInfo.parentName) ?? identityQ
        : identityQ;
      tmpParentInv.copy(parentWorldQ).invert();
      tmpLocalQ.copy(tmpParentInv).multiply(desiredWorldQ.get(boneName)!).normalize();
      tmpLocalQ.toArray(quatValues.get(boneName)!, f * 4);
    }

    if (srcHips && tgtHips) {
      srcHips.bone.getWorldPosition(tmpSrcHipsWP);
      const dy = tmpSrcHipsWP.y - srcHipsBindY;
      hipsPosValues[f * 3] = tgtHips.restLocalPos.x;
      hipsPosValues[f * 3 + 1] = tgtHips.restLocalPos.y + dy;
      hipsPosValues[f * 3 + 2] = tgtHips.restLocalPos.z;
    }
  }

  mixer.stopAllAction();

  const tracks: THREE.KeyframeTrack[] = [];
  if (srcHips && tgtHips) {
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipsPosValues));
  }
  for (const boneName of mappedBones) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, quatValues.get(boneName)!)
    );
  }

  return new THREE.AnimationClip(outName, srcClip.duration, tracks);
}

/**
 * Builds complete AnimationClips for `human.glb` (ReadyPlayerMe realistic human):
 * - Retargets real Mixamo motion-capture `idle`, `walk`, and `run` clips from `animations_mixamo.glb`
 * - Synthesizes natural hierarchical keyframed clips for combat, jump, dodge, hit, death, and flight
 */
export function buildHumanAnimationClips(
  targetScene: THREE.Object3D,
  sourceScene: THREE.Object3D,
  sourceAnimations: THREE.AnimationClip[]
): THREE.AnimationClip[] {
  const { bindMap: targetBind, orderedBones: targetOrdered } = collectBoneBindData(targetScene);
  if (targetBind.size === 0) return [];

  const clips: THREE.AnimationClip[] = [];

  if (sourceAnimations.length > 0) {
    const sourceClone = cloneSkinned(sourceScene);
    const { bindMap: sourceBind } = collectBoneBindData(sourceClone);
    const sourceByStrippedName = new Map<string, BoneBindInfo>();
    for (const [rawName, info] of sourceBind.entries()) {
      sourceByStrippedName.set(stripMixamoPrefix(rawName), info);
    }

    const alignInvMap = new Map<string, THREE.Quaternion>();
    for (const [boneName, childName] of Object.entries(LIMB_ALIGNMENT_CHILDREN)) {
      const tb = targetBind.get(boneName);
      const tc = targetBind.get(childName);
      const sb = sourceByStrippedName.get(boneName);
      const sc = sourceByStrippedName.get(childName);
      if (tb && tc && sb && sc) {
        const tDir = tc.worldBindPos.clone().sub(tb.worldBindPos).normalize();
        const sDir = sc.worldBindPos.clone().sub(sb.worldBindPos).normalize();
        if (tDir.lengthSq() > 0.1 && sDir.lengthSq() > 0.1) {
          alignInvMap.set(
            boneName,
            new THREE.Quaternion().setFromUnitVectors(sDir, tDir).invert()
          );
        }
      }
    }

    for (const [srcName, outName] of Object.entries(MIXAMO_TO_HUMAN_CLIP)) {
      const srcClip = sourceAnimations.find((c) => c.name === srcName);
      if (!srcClip) continue;
      clips.push(
        retargetMixamoClip(
          srcClip,
          outName,
          targetBind,
          targetOrdered,
          sourceClone,
          sourceByStrippedName,
          alignInvMap
        )
      );
    }
  }

  // Fallback Idle/Walk/Run if source clips were unavailable
  const armRest = 0.28;
  if (!clips.some((c) => c.name === 'Idle')) {
    clips.push(
      makePoseClip(
        'Idle',
        2.4,
        [
          {
            time: 0,
            hipsOffsetY: 0,
            pose: {
              Spine: [0.02, 0, 0],
              LeftArm: [0.04, 0, -armRest],
              LeftForeArm: [-0.15, 0, -armRest],
              RightArm: [0.04, 0, armRest],
              RightForeArm: [-0.15, 0, armRest],
            },
          },
          {
            time: 1.2,
            hipsOffsetY: 0.01,
            pose: {
              Spine: [0.03, 0.02, 0],
              LeftArm: [0.05, 0, -(armRest - 0.02)],
              LeftForeArm: [-0.18, 0, -(armRest - 0.02)],
              RightArm: [0.05, 0, armRest - 0.02],
              RightForeArm: [-0.18, 0, armRest - 0.02],
            },
          },
          {
            time: 2.4,
            hipsOffsetY: 0,
            pose: {
              Spine: [0.02, 0, 0],
              LeftArm: [0.04, 0, -armRest],
              LeftForeArm: [-0.15, 0, -armRest],
              RightArm: [0.04, 0, armRest],
              RightForeArm: [-0.15, 0, armRest],
            },
          },
        ],
        targetBind,
        targetOrdered
      )
    );
  }

  // Action, aerial, combat & flight clips on the ReadyPlayerMe skeleton
  clips.push(
    makePoseClip(
      'CombatIdle',
      1.6,
      [
        {
          time: 0,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.06, -0.22, 0],
            Spine: [0.08, 0.14, 0],
            Spine2: [0.06, 0.12, 0],
            LeftArm: [-0.28, 0.18, -0.22],
            LeftForeArm: [-0.72, 0.1, -0.22],
            RightArm: [-0.55, -0.2, 0.22],
            RightForeArm: [-0.88, 0.15, 0.15],
            LeftUpLeg: [-0.22, 0.08, 0.07],
            LeftLeg: [0.36, 0, 0],
            RightUpLeg: [0.16, -0.08, -0.07],
            RightLeg: [0.26, 0, 0],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.035,
          pose: {
            Hips: [0.06, -0.22, 0],
            Spine: [0.09, 0.15, 0],
            Spine2: [0.08, 0.14, 0],
            LeftArm: [-0.31, 0.18, -0.2],
            LeftForeArm: [-0.75, 0.1, -0.2],
            RightArm: [-0.58, -0.2, 0.2],
            RightForeArm: [-0.92, 0.15, 0.15],
            LeftUpLeg: [-0.22, 0.08, 0.07],
            LeftLeg: [0.36, 0, 0],
            RightUpLeg: [0.16, -0.08, -0.07],
            RightLeg: [0.26, 0, 0],
          },
        },
        {
          time: 1.6,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.06, -0.22, 0],
            Spine: [0.08, 0.14, 0],
            Spine2: [0.06, 0.12, 0],
            LeftArm: [-0.28, 0.18, -0.22],
            LeftForeArm: [-0.72, 0.1, -0.22],
            RightArm: [-0.55, -0.2, 0.22],
            RightForeArm: [-0.88, 0.15, 0.15],
            LeftUpLeg: [-0.22, 0.08, 0.07],
            LeftLeg: [0.36, 0, 0],
            RightUpLeg: [0.16, -0.08, -0.07],
            RightLeg: [0.26, 0, 0],
          },
        },
      ],
      targetBind,
      targetOrdered
    ),
    makePoseClip(
      'JumpStart',
      0.22,
      [
        {
          time: 0,
          hipsOffsetY: -0.08,
          pose: {
            Spine: [0.16, 0, 0],
            LeftUpLeg: [-0.42, 0, 0.04],
            LeftLeg: [0.76, 0, 0],
            RightUpLeg: [-0.42, 0, -0.04],
            RightLeg: [0.76, 0, 0],
            LeftArm: [0.28, 0, -0.28],
            LeftForeArm: [-0.2, 0, -0.28],
            RightArm: [0.28, 0, 0.28],
            RightForeArm: [-0.2, 0, 0.28],
          },
        },
        {
          time: 0.22,
          hipsOffsetY: 0.02,
          pose: {
            Spine: [0.08, 0, 0],
            LeftUpLeg: [-0.55, 0, 0.05],
            LeftLeg: [0.88, 0, 0],
            RightUpLeg: [-0.14, 0, -0.05],
            RightLeg: [0.42, 0, 0],
            LeftArm: [-0.62, 0, -0.15],
            LeftForeArm: [-0.92, 0, -0.15],
            RightArm: [-0.62, 0, 0.15],
            RightForeArm: [-0.92, 0, 0.15],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftLeg: [0.82, 0, 0],
            RightUpLeg: [-0.16, 0, -0.05],
            RightLeg: [0.4, 0, 0],
            LeftArm: [-0.45, 0, -0.12],
            LeftForeArm: [-0.82, 0, -0.12],
            RightArm: [-0.45, 0, 0.12],
            RightForeArm: [-0.82, 0, 0.12],
          },
        },
        {
          time: 0.8,
          pose: {
            Spine: [0.08, 0, 0],
            LeftUpLeg: [-0.48, 0, 0.05],
            LeftLeg: [0.82, 0, 0],
            RightUpLeg: [-0.16, 0, -0.05],
            RightLeg: [0.4, 0, 0],
            LeftArm: [-0.45, 0, -0.12],
            LeftForeArm: [-0.82, 0, -0.12],
            RightArm: [-0.45, 0, 0.12],
            RightForeArm: [-0.82, 0, 0.12],
          },
        },
      ],
      targetBind,
      targetOrdered
    ),
    makePoseClip(
      'Fall',
      0.8,
      [
        {
          time: 0,
          pose: {
            Spine: [0.06, 0, 0],
            LeftUpLeg: [-0.28, 0, 0.05],
            LeftLeg: [0.52, 0, 0],
            RightUpLeg: [-0.14, 0, -0.05],
            RightLeg: [0.32, 0, 0],
            LeftArm: [-0.22, 0, 0.1],
            LeftForeArm: [-0.58, 0, 0.1],
            RightArm: [-0.22, 0, -0.1],
            RightForeArm: [-0.58, 0, -0.1],
          },
        },
        {
          time: 0.8,
          pose: {
            Spine: [0.06, 0, 0],
            LeftUpLeg: [-0.28, 0, 0.05],
            LeftLeg: [0.52, 0, 0],
            RightUpLeg: [-0.14, 0, -0.05],
            RightLeg: [0.32, 0, 0],
            LeftArm: [-0.22, 0, 0.1],
            LeftForeArm: [-0.58, 0, 0.1],
            RightArm: [-0.22, 0, -0.1],
            RightForeArm: [-0.58, 0, -0.1],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftArm: [0.16, 0, -0.18],
            LeftForeArm: [-0.3, 0, -0.18],
            RightArm: [0.16, 0, 0.18],
            RightForeArm: [-0.3, 0, 0.18],
          },
        },
        {
          time: 0.18,
          hipsOffsetY: 0,
          pose: {
            LeftArm: [0.04, 0, -armRest],
            RightArm: [0.04, 0, armRest],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            RightArm: [-0.9, -0.5, 0.18],
            RightForeArm: [-0.95, -0.35, 0.18],
            LeftArm: [-0.25, 0, -armRest],
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
            RightArm: [-1.15, -0.65, 0.12],
            RightForeArm: [-1.05, -0.45, 0.12],
            LeftArm: [-0.2, 0, -armRest],
          },
        },
        {
          time: 0.26,
          hipsOffsetY: -0.05,
          pose: {
            Hips: [0.08, 0.25, 0],
            Spine2: [0.14, 0.45, 0],
            RightArm: [-0.55, 0.75, 0.22],
            RightForeArm: [-0.55, 0.75, 0.22],
            LeftArm: [-0.15, 0, -armRest],
          },
        },
        {
          time: 0.42,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.06, 0.1, 0],
            Spine2: [0.08, 0.18, 0],
            RightArm: [-0.65, 0.2, 0.22],
            RightForeArm: [-0.85, 0.15, 0.22],
            LeftArm: [-0.25, 0, -armRest],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            RightArm: [-0.95, 0.45, 0.2],
            RightForeArm: [-1.25, -0.25, 0.2],
            LeftArm: [-0.55, -0.2, -0.22],
            LeftForeArm: [-1.05, 0.15, -0.22],
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
            RightArm: [-0.95, 0.45, 0.2],
            RightForeArm: [-1.25, -0.25, 0.2],
            LeftArm: [-0.55, -0.2, -0.22],
            LeftForeArm: [-1.05, 0.15, -0.22],
            LeftUpLeg: [-0.28, 0, 0.06],
            LeftLeg: [0.44, 0, 0],
            RightUpLeg: [0.22, 0, -0.06],
            RightLeg: [0.3, 0, 0],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftArm: [0.42, 0, -armRest],
            RightArm: [0.42, 0, armRest],
          },
        },
        {
          time: 0.36,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.08, 0, 0],
            Spine2: [0.1, 0, 0],
            LeftArm: [0.1, 0, -armRest],
            RightArm: [0.1, 0, armRest],
          },
        },
      ],
      targetBind,
      targetOrdered
    ),
    makePoseClip(
      'HitReaction',
      0.35,
      [
        {
          time: 0,
          hipsOffsetY: 0,
          pose: {
            LeftArm: [0.04, 0, -armRest],
            RightArm: [0.04, 0, armRest],
          },
        },
        {
          time: 0.14,
          hipsOffsetY: -0.04,
          pose: {
            Spine: [-0.26, 0, 0],
            Head: [-0.3, 0, 0],
            LeftArm: [-0.25, 0, -0.15],
            RightArm: [-0.25, 0, 0.15],
          },
        },
        {
          time: 0.35,
          hipsOffsetY: 0,
          pose: {
            LeftArm: [0.04, 0, -armRest],
            RightArm: [0.04, 0, armRest],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftArm: [0.04, 0, -armRest],
            RightArm: [0.04, 0, armRest],
          },
        },
        {
          time: 0.45,
          hipsOffsetY: -0.42,
          pose: {
            Hips: [0.65, 0, 0],
            LeftUpLeg: [-0.45, 0, 0.08],
            LeftLeg: [0.85, 0, 0],
            RightUpLeg: [-0.35, 0, -0.08],
            RightLeg: [0.75, 0, 0],
            LeftArm: [-0.4, 0, -0.15],
            RightArm: [-0.4, 0, 0.15],
          },
        },
        {
          time: 0.85,
          hipsOffsetY: -0.82,
          pose: {
            Hips: [1.45, 0, 0],
            Spine2: [0.2, 0, 0],
            LeftUpLeg: [-0.2, 0, 0.1],
            LeftLeg: [0.3, 0, 0],
            RightUpLeg: [-0.15, 0, -0.1],
            RightLeg: [0.25, 0, 0],
            LeftArm: [-0.35, 0, 0.05],
            RightArm: [-0.35, 0, -0.05],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftArm: [-0.1, 0, -0.18],
            RightArm: [-0.1, 0, 0.18],
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
            LeftArm: [-0.14, 0, -0.14],
            RightArm: [-0.14, 0, 0.14],
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
            LeftArm: [-0.1, 0, -0.18],
            RightArm: [-0.1, 0, 0.18],
          },
        },
      ],
      targetBind,
      targetOrdered
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
            LeftArm: [0.55, 0, -0.25],
            RightArm: [0.55, 0, 0.25],
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
            LeftArm: [0.55, 0, -0.25],
            RightArm: [0.55, 0, 0.25],
          },
        },
      ],
      targetBind,
      targetOrdered
    )
  );

  return clips;
}

/**
 * Fallback clip builder for `adventurer_human.glb` (Quaternius Modular Men Adventurer)
 * if that modelUrl is explicitly passed.
 */
export function buildAdventurerAnimationClips(scene: THREE.Object3D): THREE.AnimationClip[] {
  const { bindMap, orderedBones } = collectBoneBindData(scene);
  if (bindMap.size === 0) return [];

  const armDown = 1.22;

  return [
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
            'LowerArm.L': [-0.14, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.14, 0, armDown],
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
            'LowerArm.L': [-0.16, 0, -(armDown - 0.03)],
            'UpperArm.R': [0.06, 0, armDown - 0.03],
            'LowerArm.R': [-0.16, 0, armDown - 0.03],
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
            'LowerArm.L': [-0.14, 0, -armDown],
            'UpperArm.R': [0.04, 0, armDown],
            'LowerArm.R': [-0.14, 0, armDown],
            'UpperLeg.L': [-0.02, 0, 0.03],
            'LowerLeg.L': [0.04, 0, 0],
            'UpperLeg.R': [0.02, 0, -0.03],
            'LowerLeg.R': [0.04, 0, 0],
          },
        },
      ],
      bindMap,
      orderedBones
    ),
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
            'LowerLeg.L': [-0.3, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.64, 0, 0],
            'UpperArm.L': [0.38, 0, -armDown],
            'LowerArm.L': [0.15, 0, -armDown],
            'UpperArm.R': [-0.38, 0, armDown],
            'LowerArm.R': [-0.75, 0, armDown],
          },
        },
        {
          time: 0.4,
          hipsOffsetY: -0.01,
          pose: {
            Hips: [0.04, -0.08, 0],
            Torso: [0.05, 0.08, 0],
            'UpperLeg.L': [0.42, 0, 0.02],
            'LowerLeg.L': [0.64, 0, 0],
            'UpperLeg.R': [-0.46, 0, -0.02],
            'LowerLeg.R': [-0.3, 0, 0],
            'UpperArm.L': [-0.38, 0, -armDown],
            'LowerArm.L': [-0.75, 0, -armDown],
            'UpperArm.R': [0.38, 0, armDown],
            'LowerArm.R': [0.15, 0, armDown],
          },
        },
        {
          time: 0.8,
          hipsOffsetY: -0.01,
          pose: {
            Hips: [0.04, 0.08, 0],
            Torso: [0.05, -0.08, 0],
            'UpperLeg.L': [-0.46, 0, 0.02],
            'LowerLeg.L': [-0.3, 0, 0],
            'UpperLeg.R': [0.42, 0, -0.02],
            'LowerLeg.R': [0.64, 0, 0],
            'UpperArm.L': [0.38, 0, -armDown],
            'LowerArm.L': [0.15, 0, -armDown],
            'UpperArm.R': [-0.38, 0, armDown],
            'LowerArm.R': [-0.75, 0, armDown],
          },
        },
      ],
      bindMap,
      orderedBones
    ),
    makePoseClip(
      'Run',
      0.56,
      [
        {
          time: 0,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.14, 0.14, 0],
            Torso: [0.2, -0.16, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.85, 0, 0.02],
            'LowerLeg.L': [-0.45, 0, 0],
            'UpperLeg.R': [0.72, 0, -0.02],
            'LowerLeg.R': [1.2, 0, 0],
            'UpperArm.L': [0.72, 0, -armDown],
            'LowerArm.L': [-0.35, 0, -armDown],
            'UpperArm.R': [-0.72, 0, armDown],
            'LowerArm.R': [-1.65, 0, armDown],
          },
        },
        {
          time: 0.28,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.14, -0.14, 0],
            Torso: [0.2, 0.16, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [0.72, 0, 0.02],
            'LowerLeg.L': [1.2, 0, 0],
            'UpperLeg.R': [-0.85, 0, -0.02],
            'LowerLeg.R': [-0.45, 0, 0],
            'UpperArm.L': [-0.72, 0, -armDown],
            'LowerArm.L': [-1.65, 0, -armDown],
            'UpperArm.R': [0.72, 0, armDown],
            'LowerArm.R': [-0.35, 0, armDown],
          },
        },
        {
          time: 0.56,
          hipsOffsetY: -0.04,
          pose: {
            Hips: [0.14, 0.14, 0],
            Torso: [0.2, -0.16, 0],
            Head: [-0.16, 0, 0],
            'UpperLeg.L': [-0.85, 0, 0.02],
            'LowerLeg.L': [-0.45, 0, 0],
            'UpperLeg.R': [0.72, 0, -0.02],
            'LowerLeg.R': [1.2, 0, 0],
            'UpperArm.L': [0.72, 0, -armDown],
            'LowerArm.L': [-0.35, 0, -armDown],
            'UpperArm.R': [-0.72, 0, armDown],
            'LowerArm.R': [-1.65, 0, armDown],
          },
        },
      ],
      bindMap,
      orderedBones
    ),
  ];
}
